import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { config } from '../config.js'
import { buildSeed } from '../../data/seed/index.js'

let db = null
let pendingSnapshot = null
let flushing = false
let flushPromise = null

const supabaseDriver = () => config.dbDriver === 'supabase'

// Older data files were written before newer collections existed. Add empty
// collections in place so an upgrade never requires deleting demo data.
function migrate(data) {
  if (!data || typeof data !== 'object') return data
  if (!Array.isArray(data.teacherApplications)) data.teacherApplications = []
  if (!Array.isArray(data.audits)) data.audits = []
  return data
}

function readFromDisk() {
  if (!fs.existsSync(config.dataFile)) return null
  try {
    return migrate(JSON.parse(fs.readFileSync(config.dataFile, 'utf8')))
  } catch (error) {
    console.warn('[db] could not parse data file, reseeding:', error.message)
    return null
  }
}

function persistLocal({ optional = false } = {}) {
  try {
    fs.mkdirSync(path.dirname(config.dataFile), { recursive: true })
    const temp = `${config.dataFile}.tmp`
    fs.writeFileSync(temp, JSON.stringify(db, null, 2), 'utf8')
    fs.renameSync(temp, config.dataFile)
    return true
  } catch (error) {
    if (!optional) throw error
    console.warn('[db] could not update the local cache:', error.message)
    return false
  }
}

function stateTable() {
  const table = config.supabaseStateTable
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new Error('SUPABASE_STATE_TABLE must be a simple table name such as app_state')
  }
  return table
}

async function supabaseRequest(query = '', options = {}) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('DB_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }
  const base = config.supabaseUrl.replace(/\/+$/, '')
  const response = await fetch(`${base}/rest/v1/${stateTable()}${query}`, {
    ...options,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 400)
    throw new Error(`Supabase ${options.method || 'GET'} ${response.status}: ${detail}`)
  }
  return response
}

async function readFromSupabase() {
  const response = await supabaseRequest('?id=eq.1&select=data', {
    headers: { Accept: 'application/json' },
  })
  const rows = await response.json()
  if (!Array.isArray(rows) || rows.length === 0) return null
  return migrate(rows[0].data)
}

async function persistToSupabase(snapshot) {
  const body = JSON.stringify({
    id: 1,
    data: JSON.parse(snapshot),
    updated_at: new Date().toISOString(),
  })
  await supabaseRequest('?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body,
  })
}

// Writes are serialized and coalesced. The in-memory state is authoritative
// for the running process, while Supabase receives the latest snapshot.
function queueSupabaseSave() {
  pendingSnapshot = JSON.stringify(db)
  void flushSupabase()
}

async function flushSupabase() {
  if (flushing) return flushPromise
  flushing = true
  flushPromise = (async () => {
    while (pendingSnapshot) {
      const snapshot = pendingSnapshot
      pendingSnapshot = null
      try {
        await persistToSupabase(snapshot)
      } catch (error) {
        pendingSnapshot = snapshot
        console.error('[db] Supabase write failed:', error.message)
        break
      }
    }
  })()
  try {
    await flushPromise
  } finally {
    flushing = false
    flushPromise = null
  }
}

export async function initDb() {
  if (db) return db

  if (supabaseDriver()) {
    let remote
    try {
      remote = await readFromSupabase()
    } catch (error) {
      throw new Error(
        `Could not load the Supabase app_state table. Run server/db/supabase.sql in the Supabase SQL Editor first. (${error.message})`,
      )
    }

    if (remote) {
      db = remote
      persistLocal({ optional: true })
      console.log('[db] loaded application data from Supabase Postgres')
      return db
    }

    db = readFromDisk() || buildSeed()
    persistLocal({ optional: true })
    await persistToSupabase(JSON.stringify(db))
    console.log('[db] seeded Supabase Postgres from', config.supabaseStateTable)
    return db
  }

  db = readFromDisk()
  if (!db) {
    db = buildSeed()
    persistLocal()
    console.log('[db] seeded a fresh data file at', config.dataFile)
  }
  return db
}

export function getDb() {
  if (db) return db
  if (supabaseDriver()) {
    throw new Error('[db] initDb() must finish before getDb() when DB_DRIVER=supabase')
  }
  db = readFromDisk()
  if (!db) {
    db = buildSeed()
    persistLocal()
    console.log('[db] seeded a fresh data file at', config.dataFile)
  }
  return db
}

export function save() {
  const current = getDb()
  persistLocal({ optional: supabaseDriver() })
  if (supabaseDriver()) queueSupabaseSave()
  return current
}

export async function resetDb() {
  db = buildSeed()
  persistLocal({ optional: supabaseDriver() })
  if (supabaseDriver()) await persistToSupabase(JSON.stringify(db))
  return db
}

export async function flushDb() {
  if (!supabaseDriver()) return true
  await flushSupabase()
  if (pendingSnapshot) await flushSupabase()
  return !pendingSnapshot
}

export function nextId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`
}

export function findUser(predicate) {
  return getDb().users.find(predicate)
}

export function userById(id) {
  return getDb().users.find((user) => user.id === id) || null
}
