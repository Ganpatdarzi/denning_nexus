import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { userById } from '../db/store.js'
import { HttpError, forbidden, unauthorized } from '../utils/http.js'

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.tokenTtl,
  })
}

function sessionUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) throw unauthorized()
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    const user = userById(payload.sub)
    if (!user) throw unauthorized('This account no longer exists.')
    return user
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw unauthorized('Your session expired. Please sign in again.')
  }
}

export function requireAuth(req, res, next) {
  try {
    const user = sessionUser(req)
    if (user.status !== 'active') {
      throw forbidden('Your account is not active yet. Contact the campus administrator.')
    }
    req.user = user
    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Pending teachers need a small, tightly-scoped window into the API so they can
 * upload verification documents and read the status of their application.
 * Every other route still uses requireAuth, which requires an active account.
 */
export function requireAuthPending(req, res, next) {
  try {
    const user = sessionUser(req)
    if (!['active', 'pending'].includes(user.status)) {
      throw forbidden('Your account is suspended. Contact the campus administrator.')
    }
    req.user = user
    next()
  } catch (error) {
    next(error)
  }
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return next()
  try {
    const payload = jwt.verify(header.slice(7).trim(), config.jwtSecret)
    const user = userById(payload.sub)
    if (user && user.status === 'active') req.user = user
  } catch {
    // A stale token simply means the visitor is anonymous on public routes.
  }
  next()
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized())
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`This action is limited to ${roles.join(' or ')} accounts.`))
    }
    next()
  }
}
