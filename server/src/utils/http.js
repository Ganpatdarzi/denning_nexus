export class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details)
export const unauthorized = (message = 'Sign in to continue.') => new HttpError(401, message)
export const forbidden = (message = 'You do not have access to this resource.') => new HttpError(403, message)
export const notFound = (message = 'Not found.') => new HttpError(404, message)
export const conflict = (message, details) => new HttpError(409, message, details)

export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next)

export function requireFields(source, fields) {
  const missing = fields.filter((field) => {
    const value = source?.[field]
    return value === undefined || value === null || String(value).trim() === ''
  })
  if (missing.length) {
    throw badRequest(`Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`)
  }
}

export function publicUser(user) {
  if (!user) return null
  const { passwordHash, ...safe } = user
  return safe
}
