import { Router } from 'express'
import { getDb, save } from '../db/store.js'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, notFound } from '../utils/http.js'

const router = Router()
router.use(requireAuth)

const mine = (req) =>
  getDb()
    .notifications.filter((notification) => notification.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

router.get(
  '/notifications',
  asyncHandler((req, res) => {
    const notifications = mine(req)
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    res.json({
      notifications: notifications.slice(0, limit),
      unread: notifications.filter((item) => !item.read).length,
    })
  }),
)

router.get(
  '/notifications/unread-count',
  asyncHandler((req, res) => {
    res.json({ unread: mine(req).filter((item) => !item.read).length })
  }),
)

router.patch(
  '/notifications/:id/read',
  asyncHandler((req, res) => {
    const db = getDb()
    const notification = db.notifications.find(
      (item) => item.id === req.params.id && item.userId === req.user.id,
    )
    if (!notification) throw notFound('Notification not found.')
    notification.read = true
    save()
    res.json({ notification })
  }),
)

router.post(
  '/notifications/read-all',
  asyncHandler((req, res) => {
    const db = getDb()
    for (const notification of db.notifications) {
      if (notification.userId === req.user.id) notification.read = true
    }
    save()
    res.json({ ok: true })
  }),
)

export default router
