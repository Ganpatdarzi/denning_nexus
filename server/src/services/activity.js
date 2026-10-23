import { getDb, nextId, save } from '../db/store.js'

export function logActivity({ type, actor, summary, targetType = null, targetId = null }) {
  const db = getDb()
  const entry = {
    id: nextId('act'),
    type,
    actorId: actor?.id || 'system',
    actorName: actor?.name || 'Denning Nexus',
    actorRole: actor?.role || 'system',
    summary,
    targetType,
    targetId,
    createdAt: new Date().toISOString(),
  }
  db.activity.unshift(entry)
  // Keep the pulse readable — the full history belongs in a real audit store.
  db.activity = db.activity.slice(0, 250)
  save()
  return entry
}
