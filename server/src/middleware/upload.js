import path from 'node:path'
import multer from 'multer'
import { config } from '../config.js'
import { HttpError } from '../utils/http.js'

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'json',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'py',
  'java',
  'cs',
  'cpp',
  'c',
  'h',
  'go',
  'rs',
  'rb',
  'php',
  'sql',
  'html',
  'css',
  'scss',
  'yml',
  'yaml',
  'sh',
  'toml',
])

const BINARY_EXTENSIONS = new Map([
  ['pdf', 'application/pdf'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
])

const MIME_BY_EXTENSION = new Map([
  ...BINARY_EXTENSIONS,
  ...Array.from(TEXT_EXTENSIONS, ([extension]) => [extension, 'text/plain']),
  ['md', 'text/markdown'],
  ['markdown', 'text/markdown'],
  ['json', 'application/json'],
  ['html', 'text/html'],
  ['css', 'text/css'],
])

export const MAX_TEXT_CHARS = 120_000
export const ALLOWED_EXTENSIONS = [...BINARY_EXTENSIONS.keys(), ...TEXT_EXTENSIONS].sort()

const maxBytes = config.maxUploadMb * 1024 * 1024

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 1, fields: 20 },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname || '').slice(1).toLowerCase()
    if (!BINARY_EXTENSIONS.has(extension) && !TEXT_EXTENSIONS.has(extension)) {
      return callback(
        new HttpError(
          400,
          `Unsupported file type. Upload ${ALLOWED_EXTENSIONS.map((item) => `.${item}`).join(', ')}.`,
        ),
      )
    }
    callback(null, true)
  },
})

export function uploadSingle(field = 'file') {
  return (req, res, next) => {
    uploader.single(field)(req, res, (error) => {
      if (!error) return next()
      if (error instanceof HttpError) return next(error)
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new HttpError(413, `Files must be smaller than ${config.maxUploadMb} MB.`))
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        return next(new HttpError(400, 'Submit one file at a time.'))
      }
      return next(new HttpError(400, error.message || 'The upload could not be read.'))
    })
  }
}

function hasMagic(buffer, extension) {
  if (extension === 'pdf') return buffer.subarray(0, 5).toString('latin1') === '%PDF-'
  if (extension === 'png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }
  if (extension === 'jpg' || extension === 'jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (extension === 'webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
  }
  return true
}

export function cleanFileName(name = 'submission') {
  return path
    .basename(String(name))
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'submission'
}

/**
 * Validates the bytes, rather than trusting the browser MIME type. Text/code
 * files are decoded into a capped string so the audit agent can inspect them
 * without needing a second download.
 */
export function inspectUpload(file) {
  if (!file) return null
  const extension = path.extname(file.originalname || '').slice(1).toLowerCase()
  const fileName = cleanFileName(file.originalname)
  if (!BINARY_EXTENSIONS.has(extension) && !TEXT_EXTENSIONS.has(extension)) {
    throw new HttpError(400, 'Unsupported file type.')
  }
  if (!file.buffer?.length) throw new HttpError(400, 'The uploaded file is empty.')
  if (!hasMagic(file.buffer, extension)) {
    throw new HttpError(400, `The file contents do not match a valid .${extension} file.`)
  }

  if (BINARY_EXTENSIONS.has(extension)) {
    return {
      fileName,
      extension,
      size: file.size,
      kind: 'binary',
      mimeType: BINARY_EXTENSIONS.get(extension),
      buffer: file.buffer,
      text: null,
      truncated: false,
    }
  }

  const raw = file.buffer.toString('utf8')
  if (raw.includes('\u0000')) {
    throw new HttpError(400, 'That file looks binary. Upload a PDF, image, or plain-text/code file.')
  }
  const truncated = raw.length > MAX_TEXT_CHARS
  return {
    fileName,
    extension,
    size: file.size,
    kind: 'text',
    mimeType: MIME_BY_EXTENSION.get(extension) || 'text/plain',
    buffer: file.buffer,
    text: truncated ? raw.slice(0, MAX_TEXT_CHARS) : raw,
    truncated,
  }
}

export function uploadMeta() {
  return {
    maxUploadMb: config.maxUploadMb,
    acceptedExtensions: ALLOWED_EXTENSIONS,
  }
}
