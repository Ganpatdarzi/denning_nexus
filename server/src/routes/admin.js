import { Router } from 'express'
import { getDb, save } from '../db/store.js'
import { asyncHandler, badRequest, forbidden, notFound, publicUser, requireFields } from '../utils/http.js'
import { courseCard, progressOf, teacherCard, threadView } from '../services/serializers.js'
import { notify } from '../services/notifications.js'
import { logActivity } from '../services/activity.js'

const router = Router()
const STATUSES = ['active', 'pending', 'suspended']

router.get(
  '/stats',
  asyncHandler((req, res) => {
    const db = getDb()
    const users = db.users
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

    const courseStats = db.courses.map((course) => courseCard(course, db))
    const enrollments = db.enrollments
    const completionRatios = enrollments.map((enrollment) => {
      const course = db.courses.find((item) => item.id === enrollment.courseId)
      return progressOf(enrollment, course).percent
    })

    const byField = db.fields.map((field) => {
      const fieldCourses = db.courses.filter((course) => course.fieldSlug === field.slug)
      const courseIds = new Set(fieldCourses.map((course) => course.id))
      const fieldEnrollments = enrollments.filter((enrollment) => courseIds.has(enrollment.courseId))
      return {
        slug: field.slug,
        name: field.name,
        accent: field.accent,
        icon: field.icon,
        courses: fieldCourses.length,
        enrollments: fieldEnrollments.length,
        students: new Set(fieldEnrollments.map((enrollment) => enrollment.studentId)).size,
      }
    })

    const pendingTeachers = users
      .filter((user) => user.role === 'teacher' && user.status === 'pending')
      .map((user) => ({
        ...teacherCard(user, db),
        appliedAt: user.createdAt,
        field: db.fields.find((field) => field.slug === user.fieldSlug)?.name || 'Unassigned',
      }))

    const recentThreads = db.threads
      .map((thread) => threadView(thread, req.user, db))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 5)

    res.json({
      users: {
        total: users.length,
        students: users.filter((user) => user.role === 'student').length,
        teachers: users.filter((user) => user.role === 'teacher').length,
        admins: users.filter((user) => user.role === 'admin').length,
        active: users.filter((user) => user.status === 'active').length,
        pending: users.filter((user) => user.status === 'pending').length,
        suspended: users.filter((user) => user.status === 'suspended').length,
      },
      courses: {
        total: db.courses.length,
        published: db.courses.filter((course) => course.published).length,
        enrollments: enrollments.length,
        capacity: db.courses.reduce((sum, course) => sum + course.seats, 0),
        seatsLeft: courseStats.reduce((sum, course) => sum + course.seatsLeft, 0),
      },
      conversations: {
        threads: db.threads.length,
        messages: db.messages.length,
        messagesLast7Days: db.messages.filter((message) => new Date(message.createdAt).getTime() >= sevenDaysAgo).length,
        unreadForAdmins: db.threads.reduce(
          (sum, thread) => sum + threadView(thread, req.user, db).unreadCount,
          0,
        ),
      },
      outcomes: {
        tracked: enrollments.reduce((sum, enrollment) => {
          const course = db.courses.find((item) => item.id === enrollment.courseId)
          return sum + (course?.outcomes.length || 0)
        }, 0),
        achieved: enrollments.reduce((sum, enrollment) => sum + enrollment.doneOutcomeIds.length, 0),
        completedCourses: enrollments.filter((enrollment) => enrollment.status === 'completed').length,
        avgCompletion: completionRatios.length
          ? Math.round(completionRatios.reduce((sum, value) => sum + value, 0) / completionRatios.length)
          : 0,
      },
      byField,
      pendingTeachers,
      topCourses: courseStats.sort((a, b) => b.enrolledCount - a.enrolledCount).slice(0, 4),
      recentThreads,
      recentActivity: db.activity.slice(0, 8),
    })
  }),
)

router.get(
  '/users',
  asyncHandler((req, res) => {
    const db = getDb()
    const { role, status, q } = req.query
    let users = [...db.users]
    if (role) users = users.filter((user) => user.role === role)
    if (status) users = users.filter((user) => user.status === status)
    if (q) {
      const needle = String(q).toLowerCase()
      users = users.filter(
        (user) =>
          user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle),
      )
    }

    const enriched = users
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((user) => {
        const base = {
          ...publicUser(user),
          courseCount: db.courses.filter((course) => course.teacherId === user.id).length,
          enrollmentCount: db.enrollments.filter((enrollment) => enrollment.studentId === user.id).length,
          fieldName: db.fields.find((field) => field.slug === user.fieldSlug)?.name || null,
        }
        return base
      })

    res.json({ users: enriched, total: enriched.length })
  }),
)

router.patch(
  '/users/:id/status',
  asyncHandler((req, res) => {
    const { status } = req.body || {}
    if (!STATUSES.includes(status)) throw badRequest(`Status must be one of ${STATUSES.join(', ')}.`)
    const db = getDb()
    const user = db.users.find((item) => item.id === req.params.id)
    if (!user) throw notFound('That account could not be found.')
    if (user.id === req.user.id) throw badRequest('You cannot change your own account status.')
    if (user.role === 'admin') throw forbidden('Administrator accounts can only be changed by the platform owner.')

    const previous = user.status
    if (previous === status) {
      return res.json({ user: publicUser(user), changed: false })
    }

    const now = new Date().toISOString()
    user.status = status

    // Approving a teacher from People & access must stay in sync with the
    // verification record, otherwise the AI review queue drifts out of date.
    if (status === 'active' && user.role === 'teacher') {
      const application = (db.teacherApplications || [])
        .filter((item) => item.userId === user.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
      if (application && application.status !== 'approved') {
        if (application.adminDecision) {
          application.decisionHistory = [
            ...(application.decisionHistory || []),
            application.adminDecision,
          ]
        }
        application.status = 'approved'
        application.adminDecision = {
          decision: 'approve',
          note: 'Approved from People & access.',
          byId: req.user.id,
          byName: req.user.name,
          at: now,
        }
        application.decidedAt = now
        application.decidedBy = req.user.id
        application.updatedAt = now
      }
      user.teacherApproved = true
      user.teacherApprovedAt = now
      user.teacherApprovedBy = req.user.id
    }

    save()

    if (status === 'active' && previous === 'pending') {
      notify({
        userIds: [user.id],
        type: 'system',
        title: 'Your faculty access is approved',
        body: 'Your teacher workspace is open. Publish a course or message your first students.',
        link: '/app/teach',
      })
      logActivity({
        type: 'user',
        actor: req.user,
        summary: `approved ${user.name} to join the faculty`,
        targetType: 'user',
        targetId: user.id,
      })
    } else if (status === 'suspended') {
      logActivity({
        type: 'user',
        actor: req.user,
        summary: `suspended ${user.name}`,
        targetType: 'user',
        targetId: user.id,
      })
    } else {
      logActivity({
        type: 'user',
        actor: req.user,
        summary: `set ${user.name} to ${status}`,
        targetType: 'user',
        targetId: user.id,
      })
    }

    res.json({ user: publicUser(user), changed: true })
  }),
)

router.get(
  '/activity',
  asyncHandler((req, res) => {
    const db = getDb()
    const { type, role } = req.query
    const limit = Math.min(Number(req.query.limit) || 30, 120)
    let items = [...db.activity]
    if (type && type !== 'all') items = items.filter((item) => item.type === type)
    if (role && role !== 'all') items = items.filter((item) => item.actorRole === role)
    res.json({ activity: items.slice(0, limit) })
  }),
)

router.post(
  '/broadcast',
  asyncHandler((req, res) => {
    const { title, body, audience = 'all' } = req.body || {}
    requireFields(req.body || {}, ['title', 'body'])
    if (!['all', 'students', 'teachers'].includes(audience)) {
      throw badRequest('Audience must be all, students or teachers.')
    }

    const db = getDb()
    const recipients = db.users.filter((user) => {
      if (user.status !== 'active') return false
      if (audience === 'all') return true
      return user.role === audience
    })

    const created = notify({
      userIds: recipients.map((user) => user.id),
      type: 'broadcast',
      title: String(title).trim().slice(0, 120),
      body: String(body).trim().slice(0, 600),
      link: '/app/notifications',
    })
    logActivity({
      type: 'broadcast',
      actor: req.user,
      summary: `sent a campus broadcast to ${audience === 'all' ? 'everyone' : audience}`,
      targetType: 'broadcast',
      targetId: created[0]?.id || null,
    })

    res.status(201).json({ delivered: created.length, audience })
  }),
)

export default router
