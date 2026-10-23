const TOKEN_KEY = 'nexus.token'

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

async function request(path, { method = 'GET', body, formData } = {}) {
  const headers = { Accept: 'application/json' }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined && !formData) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
    })
  } catch {
    throw new ApiError('Cannot reach the campus server. Is the API running?', 0)
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message || `Request failed (${response.status}).`,
      response.status,
      payload?.error?.details,
    )
  }
  return payload
}

async function requestBlob(path) {
  const headers = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  let response
  try {
    response = await fetch(`/api${path}`, { headers })
  } catch {
    throw new ApiError('Cannot reach the campus server. Is the API running?', 0)
  }
  if (!response.ok) {
    let message = `Could not open the file (${response.status}).`
    try {
      const payload = await response.json()
      message = payload?.error?.message || message
    } catch {
      // The response is not JSON; keep the generic message.
    }
    throw new ApiError(message, response.status)
  }
  return response.blob()
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData) => request(path, { method: 'POST', formData }),
  blob: (path) => requestBlob(path),
}
