import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import authRoutes from './routes/auth.js'
import catalogRoutes from './routes/catalog.js'
import meRoutes from './routes/me.js'
import messageRoutes from './routes/messages.js'
import notificationRoutes from './routes/notifications.js'
import assignmentRoutes from './routes/assignments.js'
import teacherVerificationRoutes from './routes/teacherVerifications.js'
import adminRoutes from './routes/admin.js'
import { requireAuth, requireRole } from './middleware/auth.js'
import { HttpError } from './utils/http.js'

// `npm run build && npm start` serves the compiled SPA from the API itself, so
// a single Node service can be deployed with no separate static host.
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url))

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  if (config.isProd) app.set('trust proxy', 1)
  app.use(
    cors({
      origin: [config.clientOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: false,
    }),
  )
  app.use(express.json({ limit: '256kb' }))

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'denning-nexus-api', time: new Date().toISOString() })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/admin', requireAuth, requireRole('admin'), adminRoutes)
  app.use('/api', catalogRoutes)
  // Mount before the routers that require an active account so pending
  // teachers can reach their small verification surface.
  app.use('/api', teacherVerificationRoutes)
  app.use('/api', meRoutes)
  app.use('/api', messageRoutes)
  app.use('/api', notificationRoutes)
  app.use('/api', assignmentRoutes)

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { message: `No API route matches ${req.method} ${req.originalUrl}.` } })
  })

  if (config.isProd && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next()
      res.sendFile(path.join(clientDist, 'index.html'))
    })
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err instanceof HttpError ? err.status : err.status || 500
    if (status >= 500) console.error('[api]', err)
    res.status(status).json({
      error: {
        message: status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    })
  })

  return app
}
