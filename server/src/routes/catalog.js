import { Router } from 'express'
import { getDb, nextId, save, userById } from '../db/store.js'
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler, badRequest, conflict, forbidden, notFound, requireFields } from '../utils/http.js'
import { courseCard, progressOf, teacherCard } from '../services/serializers.js'
import { logActivity } from '../services/activity.js'
import { notifyAdmins } from '../services/notifications.js'

const router = Router()
const LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const MODES = ['Online', 'Hybrid', 'On campus']

router.use(optionalAuth)

const normalizeOutcomes = (courseId, input) => {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => (typeof item === 'string' ? item : item?.text || '').trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((text) => ({ id: nextId(`o_${courseId}`), text }))
}

/* ---------------------------------- fields --------------------------------- */

router.get(
  '/fields',
  asyncHandler((req, res) => {
    const db = getDb()
    const fields = db.fields.map((field) => {
      const fieldCourses = db.courses.filter(
        (course) => course.fieldSlug === field.slug && course.published,
      )
      const courseIds = new Set(fieldCourses.map((course) => course.id))
      return {
        ...field,
        courseCount: fieldCourses.length,
        teacherCount: new Set(fieldCourses.map((course) => course.teacherId)).size,
        studentCount: new Set(
          db.enrollments
            .filter((enrollment) => courseIds.has(enrollment.courseId))
            .map((enrollment) => enrollment.studentId),
        ).size,
      }
    })
    res.json({ fields })
  }),
)

/* ---------------------------------- courses -------------------------------- */

router.get(
  '/courses',
  asyncHandler((req, res) => {
    const db = getDb()
    const { field, level, mode, q, teacherId, sort = 'rating', includeUnpublished } = req.query
    const viewer = req.user

    let courses = db.courses.filter((course) => {
      if (course.published) return true
      if (!viewer) return false
      return viewer.role === 'admin' || (viewer.role === 'teacher' && course.teacherId === viewer.id)
    })

    if (includeUnpublished !== 'true') courses = courses.filter((course) => course.published)
    if (field) courses = courses.filter((course) => course.fieldSlug === field)
    if (level) courses = courses.filter((course) => course.level === level)
    if (mode) courses = courses.filter((course) => course.mode === mode)
    if (teacherId) courses = courses.filter((course) => course.teacherId === teacherId)

    if (q) {
      const needle = String(q).toLowerCase()
      courses = courses.filter((course) => {
        const teacher = userById(course.teacherId)
        return (
          course.title.toLowerCase().includes(needle) ||
          course.code.toLowerCase().includes(needle) ||
          course.description.toLowerCase().includes(needle) ||
          course.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
          (teacher?.name || '').toLowerCase().includes(needle)
        )
      })
    }

    const cards = courses.map((course) => courseCard(course, db))
    const sorters = {
      rating: (a, b) => b.rating - a.rating,
      popular: (a, b) => b.enrolledCount - a.enrolledCount,
      newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      title: (a, b) => a.title.localeCompare(b.title),
    }
    cards.sort(sorters[sort] || sorters.rating)

    res.json({ courses: cards, total: cards.length })
  }),
)

router.get(
  '/courses/:id',
  asyncHandler((req, res) => {
    const db = getDb()
    const course = db.courses.find((item) => item.id === req.params.id)
    if (!course) throw notFound('That course could not be found.')

    const viewer = req.user
    const canManage =
      !!viewer &&
      (viewer.role === 'admin' || (viewer.role === 'teacher' && course.teacherId === viewer.id))
    if (!course.published && !canManage) throw notFound('That course could not be found.')

    const enrollment = viewer
      ? db.enrollments.find(
          (item) => item.courseId === course.id && item.studentId === viewer.id,
        )
      : null

    res.json({
      course: courseCard(course, db),
      enrollment: enrollment
        ? { ...enrollment, progress: progressOf(enrollment, course) }
        : null,
      canManage,
      viewerId: viewer?.id || null,
    })
  }),
)

router.post(
  '/courses',
  requireAuth,
  requireRole('teacher', 'admin'),
  asyncHandler((req, res) => {
    const body = req.body || {}
    requireFields(body, ['title', 'description', 'fieldSlug', 'level'])
    if (!LEVELS.includes(body.level)) throw badRequest(`Level must be one of ${LEVELS.join(', ')}.`)
    if (body.mode && !MODES.includes(body.mode)) throw badRequest('Unsupported delivery mode.')

    const db = getDb()
    const field = db.fields.find((item) => item.slug === body.fieldSlug)
    if (!field) throw badRequest('Choose a valid field for this course.')
    if (req.user.role === 'teacher' && req.user.fieldSlug !== field.slug) {
      throw forbidden('You can only create courses inside your own field.')
    }

    const id = nextId('c')
    const course = {
      id,
      code: (body.code || `${field.slug.slice(0, 3).toUpperCase()}${100 + db.courses.length}`).toUpperCase(),
      title: String(body.title).trim(),
      fieldSlug: field.slug,
      teacherId: req.user.role === 'teacher' ? req.user.id : body.teacherId || req.user.id,
      level: body.level,
      credits: Number(body.credits) || 3,
      durationWeeks: Number(body.durationWeeks) || 10,
      mode: body.mode || 'Hybrid',
      seats: Math.max(Number(body.seats) || 24, 1),
      rating: 0,
      cover: body.cover || 'reef',
      published: body.published !== false,
      description: String(body.description).trim(),
      outcomes: normalizeOutcomes(id, body.outcomes),
      tags: Array.isArray(body.tags)
        ? body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6)
        : [],
      createdAt: new Date().toISOString(),
    }
    if (!course.outcomes.length) throw badRequest('Add at least one learning outcome.')
    if (db.courses.some((item) => item.code === course.code)) {
      throw conflict(`Course code ${course.code} is already in use.`)
    }

    db.courses.push(course)
    save()
    logActivity({
      type: 'course',
      actor: req.user,
      summary: `published ${course.title} for ${field.name}`,
      targetType: 'course',
      targetId: course.id,
    })
    notifyAdmins({
      type: 'course',
      title: 'New course published',
      body: `${req.user.name} published ${course.title} in ${field.name}.`,
      link: `/app/courses/${course.id}`,
    })

    res.status(201).json({ course: courseCard(course, db) })
  }),
)

router.patch(
  '/courses/:id',
  requireAuth,
  requireRole('teacher', 'admin'),
  asyncHandler((req, res) => {
    const db = getDb()
    const course = db.courses.find((item) => item.id === req.params.id)
    if (!course) throw notFound('That course could not be found.')
    if (req.user.role !== 'admin' && course.teacherId !== req.user.id) {
      throw forbidden('Only the course teacher or an administrator can edit this course.')
    }

    const body = req.body || {}
    if (body.level && !LEVELS.includes(body.level)) throw badRequest('Unsupported course level.')
    if (body.mode && !MODES.includes(body.mode)) throw badRequest('Unsupported delivery mode.')
    if (body.fieldSlug && req.user.role === 'admin') {
      const field = db.fields.find((item) => item.slug === body.fieldSlug)
      if (!field) throw badRequest('Choose a valid field.')
      course.fieldSlug = field.slug
    }

    if (body.title !== undefined) course.title = String(body.title).trim()
    if (body.description !== undefined) course.description = String(body.description).trim()
    if (body.code !== undefined) course.code = String(body.code).trim().toUpperCase()
    if (body.level !== undefined) course.level = body.level
    if (body.mode !== undefined) course.mode = body.mode
    if (body.credits !== undefined) course.credits = Number(body.credits) || course.credits
    if (body.durationWeeks !== undefined) {
      course.durationWeeks = Number(body.durationWeeks) || course.durationWeeks
    }
    if (body.seats !== undefined) course.seats = Math.max(Number(body.seats) || course.seats, 1)
    if (body.cover !== undefined) course.cover = body.cover
    if (body.published !== undefined) course.published = !!body.published
    if (body.tags !== undefined) {
      course.tags = Array.isArray(body.tags)
        ? body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6)
        : course.tags
    }
    if (body.outcomes !== undefined) {
      const outcomes = normalizeOutcomes(course.id, body.outcomes)
      if (!outcomes.length) throw badRequest('A course needs at least one learning outcome.')
      course.outcomes = outcomes
      // Drop stale completion flags for outcomes that no longer exist.
      const validIds = new Set(outcomes.map((outcome) => outcome.id))
      for (const enrollment of db.enrollments.filter((item) => item.courseId === course.id)) {
        enrollment.doneOutcomeIds = enrollment.doneOutcomeIds.filter((id) => validIds.has(id))
      }
    }

    save()
    logActivity({
      type: 'course',
      actor: req.user,
      summary: `updated ${course.title}`,
      targetType: 'course',
      targetId: course.id,
    })
    res.json({ course: courseCard(course, db) })
  }),
)

router.get(
  '/courses/:id/roster',
  requireAuth,
  requireRole('teacher', 'admin'),
  asyncHandler((req, res) => {
    const db = getDb()
    const course = db.courses.find((item) => item.id === req.params.id)
    if (!course) throw notFound('That course could not be found.')
    if (req.user.role !== 'admin' && course.teacherId !== req.user.id) {
      throw forbidden('Only the course teacher or an administrator can view this roster.')
    }

    const roster = db.enrollments
      .filter((enrollment) => enrollment.courseId === course.id)
      .map((enrollment) => {
        const student = userById(enrollment.studentId)
        return {
          enrollmentId: enrollment.id,
          student: student
            ? {
                id: student.id,
                name: student.name,
                email: student.email,
                avatar: student.avatar,
                accent: student.accent,
                year: student.year,
                interests: student.interests,
              }
            : null,
          status: enrollment.status,
          progress: progressOf(enrollment, course),
          lastActivityAt: enrollment.lastActivityAt,
          enrolledAt: enrollment.enrolledAt,
        }
      })
      .sort((a, b) => b.progress.percent - a.progress.percent)

    res.json({ course: courseCard(course, db), roster })
  }),
)

/* --------------------------------- teachers -------------------------------- */

router.get(
  '/teachers',
  asyncHandler((req, res) => {
    const db = getDb()
    const { field, q } = req.query
    let teachers = db.users.filter((user) => user.role === 'teacher' && user.status === 'active')
    if (field) teachers = teachers.filter((teacher) => teacher.fieldSlug === field)
    if (q) {
      const needle = String(q).toLowerCase()
      teachers = teachers.filter(
        (teacher) =>
          teacher.name.toLowerCase().includes(needle) ||
          (teacher.headline || '').toLowerCase().includes(needle) ||
          teacher.expertise.some((item) => item.toLowerCase().includes(needle)),
      )
    }
    const cards = teachers
      .map((teacher) => teacherCard(teacher, db))
      .sort((a, b) => b.rating - a.rating)
    res.json({ teachers: cards })
  }),
)

router.get(
  '/teachers/:id',
  asyncHandler((req, res) => {
    const db = getDb()
    const teacher = db.users.find(
      (user) => user.id === req.params.id && user.role === 'teacher' && user.status === 'active',
    )
    if (!teacher) throw notFound('That teacher could not be found.')
    const courses = db.courses
      .filter((course) => course.teacherId === teacher.id && course.published)
      .map((course) => courseCard(course, db))
    const field = db.fields.find((item) => item.slug === teacher.fieldSlug)
    res.json({ teacher: teacherCard(teacher, db), courses, field })
  }),
)

export default router
