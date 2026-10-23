import { getDb, nextId, save } from '../db/store.js'

export function notify({ userIds, type, title, body, link = null }) {
  const db = getDb()
  const targets = [...new Set(userIds)].filter(Boolean)
  const created = targets.map((userId) => ({
    id: nextId('n'),
    userId,
    type,
    title,
    body,
    link,
    read: false,
    createdAt: new Date().toISOString(),
  }))
  db.notifications.unshift(...created)
  save()
  return created
}

export function notifyAdmins(payload) {
  const admins = getDb()
    .users.filter((user) => user.role === 'admin' && user.status === 'active')
    .map((user) => user.id)
  return notify({ ...payload, userIds: admins })
}
