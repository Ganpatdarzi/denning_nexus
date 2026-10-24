import { createApp } from '../server/src/app.js'
import { initDb } from '../server/src/db/store.js'

let appPromise

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      await initDb()
      return createApp()
    })()
  }
  return appPromise
}

export default async function handler(req, res) {
  const app = await getApp()
  return app(req, res)
}
