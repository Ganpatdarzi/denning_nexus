import fs from 'node:fs'
import { config } from '../src/config.js'

if (fs.existsSync(config.dataFile)) {
  fs.unlinkSync(config.dataFile)
  console.log('Removed', config.dataFile)
}

const { resetDb } = await import('../src/db/store.js')
await resetDb()
console.log(
  config.dbDriver === 'supabase'
    ? `Seeded a fresh database in Supabase Postgres (${config.supabaseStateTable}). Restart the API if it is already running.`
    : 'Seeded a fresh database. Restart the API if it is already running.',
)
