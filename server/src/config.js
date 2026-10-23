import 'dotenv/config'
import { fileURLToPath } from 'node:url'

const defaultDataFile = fileURLToPath(new URL('../data/db.json', import.meta.url))
const defaultUploadDir = fileURLToPath(new URL('../data/uploads', import.meta.url))

const number = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const config = {
  port: number(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET || 'denning-nexus-dev-secret-change-me',
  tokenTtl: process.env.JWT_TTL || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  dataFile: process.env.DATA_FILE || defaultDataFile,
  isProd: process.env.NODE_ENV === 'production',

  // json | supabase. The Supabase driver stores the application state as one
  // JSONB document through PostgREST, so routes keep the same data shape while
  // the database can be swapped without a big-bang rewrite.
  dbDriver: process.env.DB_DRIVER || 'json',
  supabaseStateTable: process.env.SUPABASE_STATE_TABLE || 'app_state',

  // AI auditing is optional at runtime so the rest of the campus stays usable
  // without credentials. Text submissions fall back to a transparent local check.
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  geminiTimeoutMs: number(process.env.GEMINI_TIMEOUT_MS, 90_000),

  maxUploadMb: number(process.env.MAX_UPLOAD_MB, 10),
  uploadDir: process.env.UPLOAD_DIR || defaultUploadDir,

  // local | supabase. Supabase uses the Storage REST API, so no extra SDK is
  // required. Local storage is the zero-config default.
  storageDriver: process.env.STORAGE_DRIVER || 'local',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseBucket: process.env.SUPABASE_BUCKET || 'denning-submissions',
  supabaseBucketAssignments: process.env.SUPABASE_BUCKET_ASSIGNMENTS || 'assignments',
  supabaseBucketTeacherDocs: process.env.SUPABASE_BUCKET_TEACHER_DOCS || 'teacher-verifications',
}

export const aiEnabled = Boolean(config.geminiApiKey)
