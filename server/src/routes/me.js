import { Router } from 'express'
import { getDb, nextId, save, userById } from '../db/store.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler, badRequest, conflict, forbidden, notFound, publicUser } from '../utils/http.js'
import { courseCard, progressOf, teacherCard, threadView } from '../services/serializers.js'
import { notify } from '../services/notifications.js'
import { logActivity } from '../services/activity.js'

const router = Router()
router.use(requireAuth)

/* ------------------------------- student view ------------------------------ */

function unreadMessageCount(viewer, db) {
  return db.threads
    .filter((thread) => thread.participantIds.includes(viewer.id))
    .reduce((total, thread) => total + threadView(thread, viewer, db).unreadCount, 0)
}

router.get(
  '/me/dashboard',
  asyncHandler((req, res) => {
    const db = getDb()
    const viewer = req.user

    if (viewer.role !== 'student') {
      return res.json({ role: viewer.role, redirectTo: viewer.role === 'admin' ? '/app/admin' : '/app/teach' })
    }

    const enrollments = db.enrollments.filter((item) => item.studentId === viewer.id)
    const enrolledIds = new Set(enrollments.map((item) => item.courseId))

    const courses = enrollments
      .map((enrollment) => {
        const course = db.courses.find((item) => item.id === enrollment.courseId)
        if (!course) return null
        return {
          ...courseCard(course, db),
          enrollment: { ...enrollment, progress: progressOf(enrollment, course) },
          progress: progressOf(enrollment, course),
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.enrollment.lastActivityAt) - new Date(a.enrollment.lastActivityAt))

    let recommendations = db.courses
      .filter(
        (course) =>
          course.published && !enrolledIds.has(course.id) && course.fieldSlug === viewer.fieldSlug,
      )
      .map((course) => courseCard(course, db))
    if (recommendations.length < 3) {
      const extras = db.courses
        .filter((course) => course.published && !enrolledIds.has(course.id))
        .map((course) => courseCard(course, db))
        .filter((course) => !recommendations.some((item) => item.id === course.id))
        .sort((a, b) => b.enrolledCount - a.enrolledCount)
        .slice(0, 3 - recommendations.length)
      recommendations = [...recommendations, ...extras]
    }
    recommendations = recommendations.sort((a, b) => b.rating - a.rating).slice(0, 3)

    const teacherIds = new Set(
      courses.map((course) => course.teacher?.id).filter(Boolean),
    )
    const teachers = [...teacherIds]
      .map((id) => teacherCard(userById(id), db))
      .filter(Boolean)
      .slice(0, 4)

    const outcomesDone = courses.reduce((sum, course) => sum + course.progress.done, 0)
    const outcomesTotal = courses.reduce((sum, course) => sum + course.progress.total, 0)

    res.json({
      role: 'student',
      stats: {
        activeCourses: courses.filter((course) => course.enrollment.status === 'active').length,
        completedCourses: courses.filter((course) => course.enrollment.status === 'completed').length,
        outcomesDone,
        outcomesTotal,
        avgProgress: courses.length
          ? Math.round(courses.reduce((sum, course) => sum + course.progress.percent, 0) / courses.length)
          : 0,
        unreadMessages: unreadMessageCount(viewer, db),
      },
      courses,
      recommendations,
      teachers,
      notifications: db.notifications
        .filter((item) => item.userId === viewer.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 4),
    })
  }),
)

router.post(
  '/me/enrollments',
  requireRole('student'),
  asyncHandler((req, res) => {
    const { courseId } = req.body || {}
    if (!courseId) throw badRequest('Choose a course to enrol in.')
    const db = getDb()
    const course = db.courses.find((item) => item.id === courseId && item.published)
    if (!course) throw notFound('That course is not open for enrolment.')
    if (db.enrollments.some((item) => item.courseId === course.id && item.studentId === req.user.id)) {
      throw conflict('You are already enrolled in this course.')
    }
    const enrolledCount = db.enrollments.filter((item) => item.courseId === course.id).length
    if (enrolledCount >= course.seats) throw conflict('This course is full. Join the waitlist by messaging the teacher.')

    const enrollment = {
      id: nextId('e'),
      studentId: req.user.id,
      courseId: course.id,
      status: 'active',
      doneOutcomeIds: [],
      enrolledAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    }
    db.enrollments.push(enrollment)
    save()

    notify({
      userIds: [course.teacherId],
      type: 'enrollment',
      title: 'New student enrolled',
      body: `${req.user.name} joined ${course.title}.`,
      link: `/app/teach/courses/${course.id}`,
    })
    notify({
      userIds: [req.user.id],
      type: 'enrollment',
      title: `You joined ${course.code}`,
      body: `Your learning outcomes for ${course.title} are ready to track.`,
      link: `/app/courses/${course.id}`,
    })
    logActivity({
      type: 'enrollment',
      actor: req.user,
      summary: `enrolled in ${course.title}`,
      targetType: 'course',
      targetId: course.id,
    })

    res.status(201).json({ enrollment: { ...enrollment, progress: progressOf(enrollment, course) } })
  }),
)

router.delete(
  '/me/enrollments/:courseId',
  requireRole('student'),
  asyncHandler((req, res) => {
    const db = getDb()
    const index = db.enrollments.findIndex(
      (item) => item.courseId === req.params.courseId && item.studentId === req.user.id,
    )
    if (index === -1) throw notFound('You are not enrolled in that course.')
    const course = db.courses.find((item) => item.id === req.params.courseId)
    db.enrollments.splice(index, 1)
    save()
    logActivity({
      type: 'enrollment',
      actor: req.user,
      summary: `left ${course?.title || 'a course'}`,
      targetType: 'course',
      targetId: req.params.courseId,
    })
    res.json({ ok: true })
  }),
)

router.patch(
  '/me/enrollments/:courseId/outcomes',
  requireRole('student'),
  asyncHandler((req, res) => {
    const { outcomeId, done } = req.body || {}
    if (!outcomeId) throw badRequest('Choose an outcome to update.')
    const db = getDb()
    const course = db.courses.find((item) => item.id === req.params.courseId)
    if (!course) throw notFound('Course not found.')
    const outcome = course.outcomes.find((item) => item.id === outcomeId)
    if (!outcome) throw badRequest('That outcome no longer exists.')

    const enrollment = db.enrollments.find(
      (item) => item.courseId === course.id && item.studentId === req.user.id,
    )
    if (!enrollment) throw forbidden('Enrol in this course before tracking its outcomes.')

    const wasDone = enrollment.doneOutcomeIds.includes(outcomeId)
    const shouldBeDone = done !== false
    if (shouldBeDone && !wasDone) enrollment.doneOutcomeIds.push(outcomeId)
    if (!shouldBeDone && wasDone) {
      enrollment.doneOutcomeIds = enrollment.doneOutcomeIds.filter((id) => id !== outcomeId)
    }

    const progress = progressOf(enrollment, course)
    const justCompleted = progress.percent === 100 && enrollment.status !== 'completed'
    enrollment.status = progress.percent === 100 ? 'completed' : 'active'
    enrollment.lastActivityAt = new Date().toISOString()
    save()

    if (shouldBeDone && !wasDone) {
      logActivity({
        type: 'outcome',
        actor: req.user,
        summary: `marked “${outcome.text}” as achieved in ${course.code}`,
        targetType: 'course',
        targetId: course.id,
      })
      if (justCompleted) {
        notify({
          userIds: [req.user.id, course.teacherId],
          type: 'outcome',
          title: `${req.user.name} completed ${course.code}`,
          body: `All ${progress.total} learning outcomes in ${course.title} are now achieved.`,
          link: `/app/courses/${course.id}`,
        })
      }
    }

    res.json({
      enrollment: { ...enrollment, progress },
      progress,
      completedCourse: justCompleted,
    })
  }),
)

/* ------------------------------- teacher view ------------------------------ */

router.get(
  '/me/teaching',
  requireRole('teacher'),
  asyncHandler((req, res) => {
    const db = getDb()
    const teacherCourses = db.courses.filter((course) => course.teacherId === req.user.id)
    const courseIds = new Set(teacherCourses.map((course) => course.id))

    const courses = teacherCourses.map((course) => {
      const courseEnrollments = db.enrollments.filter((item) => item.courseId === course.id)
      const avgProgress = courseEnrollments.length
        ? Math.round(
            courseEnrollments.reduce(
              (sum, enrollment) => sum + progressOf(enrollment, course).percent,
              0,
            ) / courseEnrollments.length,
          )
        : 0
      return {
        ...courseCard(course, db),
        studentCount: courseEnrollments.length,
        avgProgress,
        completedCount: courseEnrollments.filter((item) => item.status === 'completed').length,
      }
    })

    const questions = db.threads
      .filter((thread) => thread.participantIds.includes(req.user.id))
      .map((thread) => threadView(thread, req.user, db))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 5)

    res.json({
      courses,
      stats: {
        activeCourses: teacherCourses.length,
        students: new Set(
          db.enrollments
            .filter((enrollment) => courseIds.has(enrollment.courseId))
            .map((enrollment) => enrollment.studentId),
        ).size,
        unreadMessages: unreadMessageCount(req.user, db),
        pendingQuestions: db.threads.filter(
          (thread) =>
            thread.participantIds.includes(req.user.id) &&
            threadView(thread, req.user, db).unreadCount > 0,
        ).length,
      },
      questions,
    })
  }),
)

/* -------------------------------- contacts -------------------------------- */

router.get(
  '/me/contacts',
  asyncHandler((req, res) => {
    const db = getDb()
    const viewer = req.user

    if (viewer.role === 'admin') {
      const contacts = db.users
        .filter((user) => user.id !== viewer.id && user.status === 'active')
        .map((user) => ({
          id: user.id,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
          accent: user.accent,
          headline: user.headline || user.title || `${user.role} · ${user.year || ''}`.trim(),
          courses: [],
        }))
      return res.json({ contacts })
    }

    if (viewer.role === 'teacher') {
      const courses = db.courses.filter((course) => course.teacherId === viewer.id)
      const byStudent = new Map()
      for (const enrollment of db.enrollments) {
        const course = courses.find((item) => item.id === enrollment.courseId)
        if (!course) continue
        const student = userById(enrollment.studentId)
        if (!student) continue
        const entry = byStudent.get(student.id) || {
          id: student.id,
          name: student.name,
          role: student.role,
          avatar: student.avatar,
          accent: student.accent,
          headline: `${student.year || 'Student'} · ${student.fieldSlug || 'open field'}`,
          courses: [],
        }
        entry.courses.push({ id: course.id, code: course.code, title: course.title })
        byStudent.set(student.id, entry)
      }
      return res.json({ contacts: [...byStudent.values()] })
    }

    const enrollments = db.enrollments.filter((item) => item.studentId === viewer.id)
    const contacts = db.users
      .filter((user) => user.role === 'teacher' && user.status === 'active')
      .map((teacher) => ({
        id: teacher.id,
        name: teacher.name,
        role: teacher.role,
        avatar: teacher.avatar,
        accent: teacher.accent,
        headline: teacher.headline,
        courses: enrollments
          .map((enrollment) => db.courses.find((course) => course.id === enrollment.courseId))
          .filter((course) => course && course.teacherId === teacher.id)
          .map((course) => ({ id: course.id, code: course.code, title: course.title })),
      }))
      .sort((a, b) => b.courses.length - a.courses.length)
    res.json({ contacts })
  }),
)

/* --------------------------------- profile -------------------------------- */

router.patch(
  '/me/profile',
  asyncHandler((req, res) => {
    const db = getDb()
    const user = db.users.find((item) => item.id === req.user.id)
    if (!user) throw notFound('Account not found.')
    const body = req.body || {}

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (name.length < 2) throw badRequest('Your name needs at least two characters.')
      user.name = name
      user.avatar = name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('')
    }
    if (body.bio !== undefined) user.bio = String(body.bio).slice(0, 500)
    if (body.fieldSlug !== undefined) {
      const field = db.fields.find((item) => item.slug === body.fieldSlug)
      if (!field) throw badRequest('Choose a valid field.')
      if (user.role === 'teacher' && field.slug !== user.fieldSlug) {
        throw forbidden('Ask an administrator to move you to another faculty field.')
      }
      user.fieldSlug = field.slug
    }
    if (user.role === 'student') {
      if (body.interests !== undefined) {
        user.interests = Array.isArray(body.interests)
          ? body.interests.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
          : user.interests
      }
      if (body.year !== undefined) user.year = String(body.year)
    }
    if (user.role === 'teacher') {
      if (body.headline !== undefined) user.headline = String(body.headline).slice(0, 160)
      if (body.officeHours !== undefined) user.officeHours = String(body.officeHours).slice(0, 120)
      if (body.expertise !== undefined) {
        user.expertise = Array.isArray(body.expertise)
          ? body.expertise.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
          : user.expertise
      }
    }

    save()
    res.json({ user: publicUser(user) })
  }),
)

export default router
