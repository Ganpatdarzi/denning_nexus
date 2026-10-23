import { Router } from 'express'
import { getDb, nextId, save } from '../db/store.js'
import { requireAuth, requireAuthPending, requireRole } from '../middleware/auth.js'
import { asyncHandler, badRequest, conflict, notFound } from '../utils/http.js'
import { uploadSingle, inspectUpload, uploadMeta, cleanFileName } from '../middleware/upload.js'
import { storage, storageMeta } from '../services/storage.js'
import { verifyTeacherDocuments, teacherVerificationMeta } from '../services/teacherVerificationAgent.js'
import { notify, notifyAdmins } from '../services/notifications.js'
import { logActivity } from '../services/activity.js'

const router = Router()

// An application is "in flight" while a human or the AI still has to act on it.
const OPEN_STATUSES = ['pending_ai_review', 'pending_admin_review', 'approved']
const RESUBMITTABLE = ['needs_more_documents', 'rejected_by_ai', 'rejected']

function cleanName(name = 'document') {
  return cleanFileName(name).replace(/[^a-zA-Z0-9._-]+/g, '-')
}

function latestApplication(db, userId) {
  return (db.teacherApplications || [])
    .filter((application) => application.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null
}

function applicationMeta() {
  return { ai: teacherVerificationMeta(), upload: uploadMeta(), storage: storageMeta() }
}

/** Teachers never see internal storage keys; admins do. */
function forTeacher(application) {
  if (!application) return null
  return {
    ...application,
    documents: (application.documents || []).map(({ storageKey, storageBucket, ...doc }) => doc),
  }
}

function findApplication(id) {
  const application = (getDb().teacherApplications || []).find((item) => item.id === id)
  if (!application) throw notFound('Teacher application not found.')
  return application
}

function documentBucket(doc) {
  if (doc.storageBucket === 'teacher-verifications') return 'teacher'
  return doc.storageBucket || 'teacher'
}

/* ------------------------- teacher-facing endpoints ------------------------ */

router.get(
  '/teacher-applications/me',
  requireAuthPending,
  requireRole('teacher'),
  asyncHandler((req, res) => {
    const db = getDb()
    const application = latestApplication(db, req.user.id)
    res.json({
      application: forTeacher(application),
      meta: applicationMeta(),
      account: { status: req.user.status, name: req.user.name, email: req.user.email },
    })
  }),
)

router.get(
  '/teacher-applications/meta',
  requireAuthPending,
  requireRole('teacher'),
  asyncHandler((req, res) => {
    res.json({ meta: applicationMeta() })
  }),
)

router.post(
  '/teacher-applications',
  requireAuthPending,
  requireRole('teacher'),
  uploadSingle('document'),
  asyncHandler(async (req, res) => {
    const db = getDb()
    const existing = latestApplication(db, req.user.id)
    if (existing && OPEN_STATUSES.includes(existing.status)) {
      throw conflict(
        existing.status === 'approved'
          ? 'Your teacher application is already approved.'
          : 'You already have a teacher verification application under review.',
      )
    }

    const uploaded = inspectUpload(req.file)
    if (!uploaded) throw badRequest('Upload a valid ID, teaching licence, or qualification document.')
    if (uploaded.kind === 'text') {
      throw badRequest('Upload an image or PDF for verification. Text files cannot verify an identity.')
    }

    const safe = cleanName(uploaded.fileName)
    const key = `app-${existing?.id || req.user.id}-${Date.now()}-${safe}`
    const stored = await storage.put({
      key,
      buffer: uploaded.buffer,
      contentType: uploaded.mimeType,
      bucket: 'teacher',
    })

    const now = new Date().toISOString()
    const document = {
      id: nextId('tdoc'),
      fileName: uploaded.fileName,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      storageKey: stored.key,
      storageBucket: stored.bucket || 'teacher-verifications',
      uploadedAt: now,
    }

    let application = existing
    if (!application) {
      application = {
        id: nextId('tapp'),
        userId: req.user.id,
        applicantName: req.user.name,
        email: req.user.email,
        phone: req.user.phone || '',
        fieldSlug: req.user.fieldSlug || '',
        headline: req.user.headline || '',
        status: 'pending_ai_review',
        documents: [],
        aiVerdict: null,
        aiHistory: [],
        aiReviewedAt: null,
        adminDecision: null,
        decisionHistory: [],
        decidedAt: null,
        decidedBy: null,
        notes: [],
        createdAt: now,
        updatedAt: now,
      }
      if (!db.teacherApplications) db.teacherApplications = []
      db.teacherApplications.unshift(application)
    } else {
      // A rejection or a "more documents" request is not a dead end. Keep the
      // same application and preserve the previous verdicts for the audit trail.
      if (application.aiVerdict) application.aiHistory = [...(application.aiHistory || []), application.aiVerdict]
      if (application.adminDecision) {
        application.decisionHistory = [...(application.decisionHistory || []), application.adminDecision]
      }
      application.status = 'pending_ai_review'
      application.aiVerdict = null
      application.aiReviewedAt = null
      application.adminDecision = null
      application.decidedAt = null
      application.decidedBy = null
      application.updatedAt = now
    }

    application.documents = Array.isArray(application.documents) ? application.documents : []
    application.documents.push(document)
    save()

    let result
    try {
      result = await verifyTeacherDocuments({
        applicantName: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        fieldSlug: req.user.fieldSlug,
        headline: req.user.headline,
        documents: [{ buffer: uploaded.buffer, mimeType: uploaded.mimeType, fileName: uploaded.fileName }],
      })
    } catch (error) {
      // A verifier outage must never reject anyone. Queue the application for a
      // human instead, and keep the reason visible to the administrator.
      result = {
        verdict: 'AI_NEEDS_REVIEW',
        confidence: 'LOW',
        recommendation: error.message,
        extracted: {},
        checks: [],
        reasons: [error.message],
        redFlags: [],
        provider: 'error',
        model: null,
        promptVersion: teacherVerificationMeta().promptVersion,
        usage: null,
      }
    }

    application.aiVerdict = result
    application.aiReviewedAt = new Date().toISOString()
    application.status = result.verdict === 'AI_DENIED' ? 'rejected_by_ai' : 'pending_admin_review'
    application.updatedAt = application.aiReviewedAt
    save()

    notifyAdmins({
      type: 'audit',
      title:
        result.verdict === 'AI_DENIED'
          ? 'Teacher verification denied by AI'
          : result.verdict === 'AI_APPROVED'
            ? 'Teacher verification approved by AI'
            : 'Teacher verification needs human review',
      body: `${req.user.name} · ${result.verdict.replaceAll('_', ' ')}${
        result.redFlags?.[0] ? ` · ${result.redFlags[0]}` : ''
      }`,
      link: '/app/admin/verifications',
    })
    logActivity({
      type: 'audit',
      actor: req.user,
      summary: `submitted teacher verification documents. AI verdict: ${result.verdict.replaceAll('_', ' ')}.`,
      targetType: 'user',
      targetId: req.user.id,
    })

    res.status(201).json({
      application: forTeacher(application),
      ai: result,
      meta: applicationMeta(),
      ...(result.provider === 'error' ? { aiError: result.recommendation } : {}),
    })
  }),
)

/* ---------------------------- admin endpoints ---------------------------- */

router.get(
  '/admin/teacher-verifications',
  requireAuth,
  requireRole('admin'),
  asyncHandler((req, res) => {
    const db = getDb()
    const applications = (db.teacherApplications || [])
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((application) => {
        const user = db.users.find((item) => item.id === application.userId)
        return {
          ...application,
          applicant: user
            ? {
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                accent: user.accent,
                role: user.role,
                status: user.status,
                fieldSlug: user.fieldSlug,
                headline: user.headline,
                createdAt: user.createdAt,
              }
            : { name: application.applicantName, email: application.email },
        }
      })

    const counts = {
      total: applications.length,
      pending: applications.filter((item) =>
        ['pending_ai_review', 'pending_admin_review', 'rejected_by_ai'].includes(item.status),
      ).length,
      aiDenied: applications.filter((item) => item.aiVerdict?.verdict === 'AI_DENIED').length,
      approved: applications.filter((item) => item.status === 'approved').length,
    }

    res.json({ applications, counts, meta: applicationMeta() })
  }),
)

router.get(
  '/admin/teacher-verifications/:id/file/:docId',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const application = findApplication(req.params.id)
    const doc = (application.documents || []).find((item) => item.id === req.params.docId)
    if (!doc) throw notFound('That document is not attached to this application.')

    const url = doc.storageKey
      ? await storage.getSignedUrl(doc.storageKey, documentBucket(doc), 300).catch(() => null)
      : null

    res.json({
      url,
      expiresIn: url ? 300 : null,
      // Local storage has no signed URLs. The admin UI falls back to this
      // authenticated stream, so previews work in both development modes.
      fallback: `/api/admin/teacher-verifications/${application.id}/file/${doc.id}/raw`,
    })
  }),
)

router.get(
  '/admin/teacher-verifications/:id/file/:docId/raw',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const application = findApplication(req.params.id)
    const doc = (application.documents || []).find((item) => item.id === req.params.docId)
    if (!doc) throw notFound('That document is not attached to this application.')
    if (!doc.storageKey) throw notFound('This document has no stored file.')

    const file = await storage.get(doc.storageKey, documentBucket(doc))
    res.setHeader('Content-Type', doc.mimeType || file.contentType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename="${cleanName(doc.fileName)}"`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.send(file.buffer)
  }),
)

router.patch(
  '/admin/teacher-verifications/:id/decision',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const application = findApplication(req.params.id)
    const decision = String(req.body?.decision || '').toLowerCase()
    const note = String(req.body?.note || '').trim().slice(0, 1200)
    if (!['approve', 'reject', 'request_more'].includes(decision)) {
      throw badRequest('Choose approve, reject, or request_more.')
    }
    if ((decision === 'reject' || decision === 'request_more') && note.length < 5) {
      throw badRequest('Add a short note explaining the decision.')
    }

    const now = new Date().toISOString()
    if (application.adminDecision) {
      application.decisionHistory = [...(application.decisionHistory || []), application.adminDecision]
    }
    application.adminDecision = {
      decision,
      note:
        note ||
        (decision === 'approve'
          ? application.aiVerdict?.verdict === 'AI_DENIED'
            ? 'Approved by administrator after reviewing the AI denial.'
            : 'Approved by administrator.'
          : ''),
      byId: req.user.id,
      byName: req.user.name,
      at: now,
    }
    application.decidedAt = now
    application.decidedBy = req.user.id
    application.updatedAt = now

    const user = getDb().users.find((item) => item.id === application.userId)

    if (decision === 'approve') {
      application.status = 'approved'
      if (user) {
        user.status = 'active'
        user.role = 'teacher'
        user.teacherApproved = true
        user.teacherApprovedAt = now
        user.teacherApprovedBy = req.user.id
      }
      notify({
        userIds: [application.userId],
        type: 'audit',
        title: 'Your teacher application was approved',
        body: application.adminDecision.note,
        link: '/app/teach',
      })
      logActivity({
        type: 'audit',
        actor: req.user,
        summary: `approved teacher application for ${application.applicantName}.`,
        targetType: 'user',
        targetId: application.userId,
      })
    } else if (decision === 'reject') {
      application.status = 'rejected'
      notify({
        userIds: [application.userId],
        type: 'audit',
        title: 'Your teacher application was not approved',
        body: application.adminDecision.note,
        link: '/apply',
      })
      logActivity({
        type: 'audit',
        actor: req.user,
        summary: `rejected teacher application for ${application.applicantName}.`,
        targetType: 'user',
        targetId: application.userId,
      })
    } else {
      application.status = 'needs_more_documents'
      notify({
        userIds: [application.userId],
        type: 'audit',
        title: 'More documents needed for your teacher application',
        body: application.adminDecision.note,
        link: '/apply',
      })
      logActivity({
        type: 'audit',
        actor: req.user,
        summary: `requested more documents from ${application.applicantName}.`,
        targetType: 'user',
        targetId: application.userId,
      })
    }

    save()
    res.json({
      application,
      applicant: user
        ? { id: user.id, name: user.name, status: user.status, role: user.role }
        : null,
    })
  }),
)

export default router
