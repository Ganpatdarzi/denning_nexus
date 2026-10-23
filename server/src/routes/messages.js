import { Router } from 'express'
import { getDb, nextId, save, userById } from '../db/store.js'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, badRequest, forbidden, notFound, requireFields } from '../utils/http.js'
import { threadView } from '../services/serializers.js'
import { notify, notifyAdmins } from '../services/notifications.js'
import { logActivity } from '../services/activity.js'

const router = Router()
router.use(requireAuth)

function canAccess(thread, viewer) {
  return viewer.role === 'admin' || thread.participantIds.includes(viewer.id)
}

function getThreadOrFail(id, viewer) {
  const db = getDb()
  const thread = db.threads.find((item) => item.id === id)
  if (!thread) throw notFound('That conversation could not be found.')
  if (!canAccess(thread, viewer)) throw forbidden('This conversation is private.')
  return { db, thread }
}

function messageView(message, db) {
  const sender = userById(message.senderId)
  return {
    ...message,
    sender: sender
      ? {
          id: sender.id,
          name: sender.name,
          role: sender.role,
          avatar: sender.avatar,
          accent: sender.accent,
        }
      : null,
  }
}

function messagesForThread(threadId, db) {
  return db.messages
    .filter((message) => message.threadId === threadId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((message) => messageView(message, db))
}

router.get(
  '/threads',
  asyncHandler((req, res) => {
    const db = getDb()
    const viewer = req.user
    const { q } = req.query
    let threads = db.threads.filter((thread) => canAccess(thread, viewer))
    const views = threads
      .map((thread) => threadView(thread, viewer, db))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    const filtered = q
      ? views.filter((thread) => {
          const needle = String(q).toLowerCase()
          return (
            thread.subject.toLowerCase().includes(needle) ||
            thread.participants.some((person) => person.name.toLowerCase().includes(needle)) ||
            (thread.course?.code || '').toLowerCase().includes(needle)
          )
        })
      : views

    res.json({
      threads: filtered,
      total: filtered.length,
      unread: views.reduce((sum, thread) => sum + thread.unreadCount, 0),
    })
  }),
)

router.post(
  '/threads',
  asyncHandler((req, res) => {
    const { recipientId, courseId, subject, body } = req.body || {}
    requireFields(req.body || {}, ['recipientId', 'subject', 'body'])
    const db = getDb()
    const viewer = req.user
    const recipient = userById(recipientId)

    if (!recipient || recipient.status !== 'active') throw badRequest('That person is not available to message.')
    if (recipient.id === viewer.id) throw badRequest('You cannot start a conversation with yourself.')
    if (String(subject).trim().length < 4) throw badRequest('Add a slightly longer subject line.')
    if (String(body).trim().length < 2) throw badRequest('Write a short first message.')

    let course = null
    if (courseId) {
      course = db.courses.find((item) => item.id === courseId)
      if (!course) throw badRequest('That course could not be found.')
    }

    if (viewer.role === 'student' && recipient.role !== 'teacher') {
      throw forbidden('Students can start conversations with teachers. Administrators can open other threads for you.')
    }
    if (viewer.role === 'teacher') {
      if (recipient.role !== 'student') throw forbidden('Faculty threads are for students in your courses.')
      const sharedCourses = db.enrollments
        .filter((enrollment) => enrollment.studentId === recipient.id)
        .map((enrollment) => db.courses.find((course) => course.id === enrollment.courseId))
        .filter((item) => item && item.teacherId === viewer.id)
      if (!sharedCourses.length) throw forbidden('That student is not enrolled in any of your courses.')
      if (course && course.teacherId !== viewer.id) throw forbidden('Choose one of your own courses.')
    }
    if (viewer.role === 'admin') {
      // Admins can open a moderation thread with anyone.
    }

    if (viewer.role === 'student' && course && course.teacherId !== recipient.id) {
      throw badRequest('That course is taught by a different teacher.')
    }

    const now = new Date().toISOString()
    const thread = {
      id: nextId('th'),
      subject: String(subject).trim().slice(0, 140),
      courseId: course?.id || null,
      participantIds: [viewer.id, recipient.id],
      status: 'open',
      reads: { [viewer.id]: now },
      createdAt: now,
      updatedAt: now,
    }
    const message = {
      id: nextId('m'),
      threadId: thread.id,
      senderId: viewer.id,
      body: String(body).trim().slice(0, 4000),
      createdAt: now,
    }
    db.threads.push(thread)
    db.messages.push(message)
    save()

    notify({
      userIds: [recipient.id],
      type: 'message',
      title: `${viewer.name} started a conversation`,
      body: `${thread.subject}${course ? ` · ${course.code}` : ''}`,
      link: `/app/messages?thread=${thread.id}`,
    })
    if (viewer.role !== 'admin') {
      notifyAdmins({
        type: 'message',
        title: 'New conversation opened',
        body: `${viewer.name} started a thread${course ? ` in ${course.code}` : ''}.`,
        link: '/app/admin/threads',
      })
    }
    logActivity({
      type: 'thread',
      actor: viewer,
      summary: `opened a conversation with ${recipient.name}${course ? ` in ${course.code}` : ''}`,
      targetType: 'thread',
      targetId: thread.id,
    })

    res.status(201).json({
      thread: threadView(thread, viewer, db),
      messages: messagesForThread(thread.id, db),
    })
  }),
)

router.get(
  '/threads/:id',
  asyncHandler((req, res) => {
    const { db, thread } = getThreadOrFail(req.params.id, req.user)
    res.json({
      thread: threadView(thread, req.user, db),
      messages: messagesForThread(thread.id, db),
    })
  }),
)

router.post(
  '/threads/:id/messages',
  asyncHandler((req, res) => {
    const { body } = req.body || {}
    requireFields(req.body || {}, ['body'])
    const { db, thread } = getThreadOrFail(req.params.id, req.user)
    if (thread.status === 'archived') throw badRequest('This conversation is archived and cannot receive replies.')

    const now = new Date().toISOString()
    const message = {
      id: nextId('m'),
      threadId: thread.id,
      senderId: req.user.id,
      body: String(body).trim().slice(0, 4000),
      createdAt: now,
    }
    db.messages.push(message)
    thread.updatedAt = now
    thread.reads = { ...thread.reads, [req.user.id]: now }
    save()

    const recipients = thread.participantIds.filter((id) => id !== req.user.id)
    if (recipients.length) {
      notify({
        userIds: recipients,
        type: 'message',
        title: `${req.user.name} replied`,
        body: `${thread.subject} · ${message.body.slice(0, 90)}${message.body.length > 90 ? '…' : ''}`,
        link: `/app/messages?thread=${thread.id}`,
      })
    }
    logActivity({
      type: 'message',
      actor: req.user,
      summary: `replied in “${thread.subject}”`,
      targetType: 'thread',
      targetId: thread.id,
    })

    res.status(201).json({
      message: messageView(message, db),
      thread: threadView(thread, req.user, db),
    })
  }),
)

router.patch(
  '/threads/:id/read',
  asyncHandler((req, res) => {
    const { db, thread } = getThreadOrFail(req.params.id, req.user)
    thread.reads = { ...thread.reads, [req.user.id]: new Date().toISOString() }
    save()
    res.json({ thread: threadView(thread, req.user, db) })
  }),
)

export default router
