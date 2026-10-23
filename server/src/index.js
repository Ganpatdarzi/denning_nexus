import { createApp } from './app.js'
import { config } from './config.js'
import { initDb, flushDb } from './db/store.js'

try {
  await initDb()
} catch (error) {
  console.error(error.message || error)
  process.exit(1)
}

const app = createApp()
const server = app.listen(config.port, () => {
  console.log(`Denning Nexus API ready on http://localhost:${config.port}`)
  console.log(`Health check: http://localhost:${config.port}/api/health`)
  console.log(`Demo sign-in: admin@denning.edu / Password123!`)
  console.log(`Database driver: ${config.dbDriver}${config.dbDriver === 'supabase' ? ` (${config.supabaseStateTable})` : ''}`)
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Stop the other process or set PORT in server/.env.`)
    process.exit(1)
  }
  throw error
})

let shuttingDown = false
const shutdown = async () => {
  if (shuttingDown) return
  shuttingDown = true
  try {
    const flushed = await flushDb()
    if (!flushed) console.error('[db] latest changes may not have reached Supabase Postgres')
  } catch (error) {
    console.error('[db] flush during shutdown failed:', error.message)
  }
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5_000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
