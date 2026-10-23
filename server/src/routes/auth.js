import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { getDb, nextId, save } from '../db/store.js'
import { requireAuthPending, signToken } from '../middleware/auth.js'
import { HttpError, asyncHandler, badRequest, conflict, forbidden, publicUser, requireFields, unauthorized } from '../utils/http.js'
import { notify, notifyAdmins } from '../services/notifications.js'
import { logActivity } from '../services/activity.js'

const router = Router()
const attempts = new Map()
const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 12
const ACCENTS = ['iris', 'cyan', 'amber', 'rose', 'lime']

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function rateLimit(ip) {
  const now = Date.now()
  const record = attempts.get(ip)
  if (!record || now > record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  record.count += 1
  if (record.count > MAX_ATTEMPTS) {
    throw new HttpError(429, 'Too many sign-in attempts. Try again in a few minutes.')
  }
}

router.get('/demo-accounts', (req, res) => {
  const db = getDb()
  res.json({
    password: db.meta.demoPassword,
    accounts: db.users
      .filter((user) => user.status === 'active')
      .map((user) => ({ name: user.name, email: user.email, role: user.role })),
  })
})

router.post(
  '/register',
  asyncHandler((req, res) => {
    const { name, email, password, role = 'student', fieldSlug, headline, bio } = req.body || {}
    requireFields(req.body || {}, ['name', 'email', 'password'])

    if (!['student', 'teacher'].includes(role)) {
      throw badRequest('Choose either a student or teacher account.')
    }
    if (!emailPattern.test(email)) throw badRequest('Enter a valid email address.')
    if (String(password).length < 8) throw badRequest('Use at least 8 characters for your password.')

    const db = getDb()
    if (db.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
      throw conflict('An account with that email already exists.')
    }
    const field = db.fields.find((item) => item.slug === fieldSlug)
    if (role === 'teacher' && !field) throw badRequest('Choose the field you want to teach in.')

    const user = {
      id: nextId('u'),
      role,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      passwordHash: bcrypt.hashSync(password, 10),
      status: role === 'teacher' ? 'pending' : 'active',
      avatar: initials(name),
      accent: ACCENTS[db.users.length % ACCENTS.length],
      fieldSlug: field?.slug || null,
      headline: role === 'teacher' ? headline || 'New faculty member' : undefined,
      bio: bio || '',
      ...(role === 'teacher'
        ? { expertise: [], officeHours: 'By appointment', rating: 0 }
        : { interests: [], year: 'Year 1' }),
      createdAt: new Date().toISOString(),
    }

    db.users.push(user)
    save()

    if (role === 'teacher') {
      notifyAdmins({
        type: 'approval',
        title: 'Teacher approval waiting',
        body: `${user.name} applied to teach in ${field.name}.`,
        link: '/app/admin/users?status=pending',
      })
      logActivity({
        type: 'user',
        actor: user,
        summary: `applied to join the faculty in ${field.name}`,
        targetType: 'user',
        targetId: user.id,
      })
      return res.status(201).json({
        // Pending teachers get a limited session so they can upload their
        // verification documents immediately after signing up.
        pending: true,
        token: signToken(user),
        user: publicUser(user),
        message:
          'Application received. Upload your ID, licence or qualification so the AI and an administrator can review it.',
      })
    }

    notify({
      userIds: [user.id],
      type: 'system',
      title: 'Welcome to Denning Nexus',
      body: 'Your campus is ready. Pick a field, explore courses and start a conversation with a teacher.',
      link: '/app/explore',
    })
    logActivity({
      type: 'user',
      actor: user,
      summary: `joined Denning Nexus in ${field?.name || 'an open field'}`,
      targetType: 'user',
      targetId: user.id,
    })

    res.status(201).json({
      token: signToken(user),
      user: publicUser(user),
      message: 'Account created. Welcome to the campus.',
    })
  }),
)

router.post(
  '/login',
  asyncHandler((req, res) => {
    const { email, password } = req.body || {}
    requireFields(req.body || {}, ['email', 'password'])
    rateLimit(req.ip)

    const db = getDb()
    const user = db.users.find((item) => item.email.toLowerCase() === String(email).toLowerCase())
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      throw unauthorized('That email and password combination does not match an account.')
    }
    // Pending teachers may sign in, but the API only exposes their application
    // endpoints until an administrator activates the account.
    if (user.status === 'pending' && user.role !== 'teacher') {
      throw forbidden('Your application is still under review. We will notify you by email.')
    }
    if (user.status === 'suspended') {
      throw forbidden('This account is suspended. Please contact the campus administrator.')
    }

    attempts.delete(req.ip)
    res.json({ token: signToken(user), user: publicUser(user) })
  }),
)

router.get('/me', requireAuthPending, (req, res) => {
  const db = getDb()
  const unreadNotifications = db.notifications.filter(
    (notification) => notification.userId === req.user.id && !notification.read,
  ).length
  res.json({ user: publicUser(req.user), unreadNotifications })
})

export default router
