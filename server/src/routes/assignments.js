import { Router } from 'express'
import { getDb, nextId, save } from '../db/store.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../utils/http.js'
import { assignmentView, auditView, latestAuditFor, submissionView } from '../services/assignmentViews.js'
import { notify, notifyAdmins } from '../services/notifications.js'
import { logActivity } from '../services/activity.js'
import { storage, storageMeta } from '../services/storage.js'
import { uploadSingle, inspectUpload, uploadMeta, cleanFileName } from '../middleware/upload.js'
import { aiEnabled } from '../config.js'
import { auditSubmission, preflightAssignment, aiMeta, PROMPT_VERSION } from '../services/auditAgent.js'

const router = Router()
router.use(requireAuth)

const STATUS_LABEL = {
  PASSED: 'Passed',
  NEEDS_REVISION: 'Needs revision',
  REJECTED: 'Rejected',
}
const STATUSES = Object.keys(STATUS_LABEL)

function courseFor(assignment, db = getDb()) {
  return db.courses.find((course) => course.id === assignment.courseId) || null
}

function enrolled(studentId, courseId, db = getDb()) {
  return db.enrollments.some(
    (enrollment) =>
      enrollment.studentId === studentId &&
      enrollment.courseId === courseId &&
      enrollment.status === 'active',
  )
}

function canSeeAssignment(viewer, assignment, db = getDb()) {
  if (!assignment) return false
  if (viewer.role === 'admin') return true
  if (viewer.role === 'teacher') return assignment.teacherId === viewer.id
  return assignment.published !== false && enrolled(viewer.id, assignment.courseId, db)
}

function canManageAssignment(viewer, assignment) {
  return viewer.role === 'admin' || (viewer.role === 'teacher' && assignment?.teacherId === viewer.id)
}

function canSeeSubmission(viewer, submission, assignment) {
  if (!submission || !assignment) return false
  if (viewer.role === 'admin') return true
  if (viewer.role === 'teacher') return assignment.teacherId === viewer.id
  return submission.studentId === viewer.id
}

function assignmentOr404(id) {
  const assignment = getDb().assignments.find((item) => item.id === id)
  if (!assignment) throw notFound('Assignment not found.')
  return assignment
}

function submissionOr404(id) {
  const submission = getDb().submissions.find((item) => item.id === id)
  if (!submission) throw notFound('Submission not found.')
  return submission
}

function normaliseSections(input) {
  const source = Array.isArray(input)
    ? input
    : String(input || '')
        .split(/\r?\n|;/)
        .flatMap((line) => (line.includes(',') ? line.split(',') : [line]))
  return source
    .map((item) => String(typeof item === 'string' ? item : item?.text || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((text) => text.slice(0, 140))
}

function normaliseRubric(input) {
  const source = Array.isArray(input)
    ? input
    : String(input || '')
        .split(/\r?\n/)
        .map((line) => {
          const [label, description, weight] = line.split('|').map((part) => part?.trim())
          return { label, description, weight }
        })
  if (!source.length) throw badRequest('Add at least one rubric criterion.')
  return source
    .map((item, index) => ({
      id: item?.id || nextId('rub'),
      label: String(typeof item === 'string' ? item : item?.label || item?.criterion || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140),
      description: String(item?.description || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 900),
      weight: Math.min(100, Math.max(1, Math.round(Number(item?.weight) || 10))),
      order: index,
    }))
    .filter((item) => item.label)
    .slice(0, 10)
    .map(({ order, ...item }) => item)
}

function normaliseDue(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw badRequest('Choose a valid due date.')
  return date.toISOString()
}

function assignmentInput(body, existing = null) {
  const title = String(body.title ?? existing?.title ?? '').replace(/\s+/g, ' ').trim()
  const instructions = String(body.instructions ?? existing?.instructions ?? '').trim()
  const rubric = normaliseRubric(body.rubric ?? existing?.rubric)
  const requiredSections = normaliseSections(body.requiredSections ?? existing?.requiredSections)
  const dueAt = normaliseDue('dueAt' in body ? body.dueAt : existing?.dueAt)
  if (title.length < 4) throw badRequest('Give the assignment a clear title.')
  if (instructions.length < 40) throw badRequest('Add a brief of at least 40 characters.')
  if (!rubric.length) throw badRequest('Add at least one rubric criterion.')
  return {
    title: title.slice(0, 160),
    instructions: instructions.slice(0, 12_000),
    rubric,
    requiredSections,
    dueAt,
    published: body.published === undefined ? existing?.published !== false : body.published !== false,
  }
}

function makeAudit({ result, submission, actor, teacherNote = '' }) {
  const db = getDb()
  const meta = result._meta || { provider: result.provider || 'heuristic', model: result.model || 'unknown' }
  const { _meta, usage, ...cleanResult } = result
  const audit = {
    id: nextId('aud'),
    submissionId: submission.id,
    assignmentId: submission.assignmentId,
    courseId: submission.courseId,
    studentId: submission.studentId,
    provider: meta.provider,
    model: meta.model,
    promptVersion: PROMPT_VERSION,
    createdAt: new Date().toISOString(),
    triggeredById: actor.id,
    triggeredByName: actor.name,
    teacherNote,
    usage: usage || null,
    result: cleanResult,
  }
  db.audits.unshift(audit)
  submission.latestAuditId = audit.id
  submission.status = submission.teacherDecision ? 'reviewed' : 'audited'
  submission.lastAuditError = null
  submission.updatedAt = new Date().toISOString()
  return audit
}

async function contentForAudit(submission) {
  if (submission.kind === 'binary') {
    if (!submission.storageKey) throw badRequest('The submitted file is no longer available for auditing.')
    const bucket = submission.storageDriver === 'supabase' ? 'assignments' : 'default'
    const file = await storage.get(submission.storageKey, bucket)
    return {
      ...submission,
      mimeType: submission.mimeType || file.contentType,
      buffer: file.buffer,
      contentText: null,
    }
  }
  return { ...submission, contentText: submission.contentText || '' }
}

function notifyAuditResult({ submission, student, assignment, course, audit, actor, trigger }) {
  const status = audit.result.overall_status
  const label = STATUS_LABEL[status] || status
  if (actor.id !== student.id) {
    notify({
      userIds: [student.id],
      type: 'audit',
      title: `AI re-check: ${label}`,
      body: audit.result.summary || audit.result.rejection_feedback || 'Your teacher ran a fresh AI check.',
      link: `/app/assignments?assignment=${assignment.id}`,
    })
  }
  notify({
    userIds: [assignment.teacherId],
    type: 'audit',
    title: `${course?.code || 'Course'} · ${trigger === 'teacher' ? 'Re-audit' : 'New submission'} from ${student.name}`,
    body: `AI status: ${label}. ${audit.result.summary || ''}`.trim().slice(0, 400),
    link: `/app/assignments?submission=${submission.id}`,
  })
  if (status === 'REJECTED' || (audit.result.integrity_flags || []).length) {
    notifyAdmins({
      type: 'audit',
      title: `AI flagged a submission in ${course?.code || 'a course'}`,
      body: `${student.name} · ${assignment.title}: ${label}${
        audit.result.integrity_flags?.length ? ` · ${audit.result.integrity_flags[0]}` : ''
      }`,
      link: `/app/assignments?submission=${submission.id}`,
    })
  }
}

function activityForAudit({ submission, student, assignment, course, audit, actor, trigger }) {
  const status = audit.result.overall_status
  logActivity({
    type: 'audit',
    actor,
    summary: `${trigger === 'teacher' ? 'Re-audited' : 'AI-audited'} ${student.name}'s ${course?.code || 'course'} submission for “${assignment.title}” — ${STATUS_LABEL[status] || status}.`,
    targetType: 'submission',
    targetId: submission.id,
  })
}

/* --------------------------------- metadata -------------------------------- */

router.get(
  '/assignments/meta',
  asyncHandler((req, res) => {
    res.json({
      ai: aiMeta(),
      storage: storageMeta(),
      upload: uploadMeta(),
      promptVersion: PROMPT_VERSION,
    })
  }),
)

/* -------------------------------- assignments ------------------------------ */

router.get(
  '/assignments',
  asyncHandler((req, res) => {
    const db = getDb()
    const viewer = req.user
    const courseFilter = String(req.query.course || req.query.courseId || '').trim()
    let assignments = db.assignments.filter((assignment) => canSeeAssignment(viewer, assignment, db))
    if (courseFilter) assignments = assignments.filter((assignment) => assignment.courseId === courseFilter)
    assignments = [...assignments].sort((a, b) => {
      if (!a.dueAt) return 1
      if (!b.dueAt) return -1
      return new Date(a.dueAt) - new Date(b.dueAt)
    })

    const views = assignments.map((assignment) => assignmentView(assignment, viewer, db))
    let stats

    if (viewer.role === 'student') {
      const mine = db.submissions.filter((submission) => submission.studentId === viewer.id)
      const courseIds = new Set(
        db.enrollments.filter((enrollment) => enrollment.studentId === viewer.id).map((enrollment) => enrollment.courseId),
      )
      const relevant = mine.filter((submission) => courseIds.has(submission.courseId))
      const effective = relevant.map((submission) => {
        const audit = latestAuditFor(submission, db)
        return submission.teacherDecision?.status || audit?.result?.overall_status || null
      })
      stats = {
        assignments: views.length,
        submitted: relevant.length,
        passed: effective.filter((status) => status === 'PASSED').length,
        needsRevision: effective.filter((status) => status === 'NEEDS_REVISION').length,
        rejected: effective.filter((status) => status === 'REJECTED').length,
        awaiting: relevant.filter((submission) => !latestAuditFor(submission, db) && !submission.teacherDecision).length,
      }
    } else {
      const ids = new Set(views.map((assignment) => assignment.id))
      const submissions = db.submissions.filter((submission) => ids.has(submission.assignmentId))
      const statuses = submissions.map((submission) => {
        const audit = latestAuditFor(submission, db)
        return submission.teacherDecision?.status || audit?.result?.overall_status || null
      })
      stats = {
        assignments: views.length,
        submissions: submissions.length,
        awaitingReview: submissions.filter(
          (submission) => !submission.teacherDecision && !latestAuditFor(submission, db),
        ).length,
        passed: statuses.filter((status) => status === 'PASSED').length,
        needsRevision: statuses.filter((status) => status === 'NEEDS_REVISION').length,
        rejected: statuses.filter((status) => status === 'REJECTED').length,
      }
    }

    const courses =
      viewer.role === 'student'
        ? []
        : db.courses
            .filter((course) => viewer.role === 'admin' || course.teacherId === viewer.id)
            .map((course) => ({ id: course.id, code: course.code, title: course.title }))

    const assignmentIds = new Set(views.map((assignment) => assignment.id))
    const submissionViews =
      viewer.role === 'student'
        ? []
        : db.submissions
            .filter((submission) => assignmentIds.has(submission.assignmentId))
            .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
            .map((submission) => submissionView(submission, viewer, db))

    res.json({
      assignments: views,
      submissions: submissionViews,
      stats,
      courses,
      meta: { ai: aiMeta(), storage: storageMeta(), upload: uploadMeta(), promptVersion: PROMPT_VERSION },
    })
  }),
)

router.post(
  '/assignments',
  requireRole('teacher', 'admin'),
  asyncHandler((req, res) => {
    const db = getDb()
    const course = db.courses.find((item) => item.id === req.body?.courseId)
    if (!course) throw badRequest('Choose a course for this assignment.')
    if (req.user.role === 'teacher' && course.teacherId !== req.user.id) {
      throw forbidden('You can only create assignments for courses you teach.')
    }
    const input = assignmentInput(req.body)
    const now = new Date().toISOString()
    const assignment = {
      id: nextId('a'),
      courseId: course.id,
      teacherId: course.teacherId,
      ...input,
      preflight: null,
      createdAt: now,
      updatedAt: now,
    }
    db.assignments.unshift(assignment)
    save()

    const studentIds = db.enrollments
      .filter((enrollment) => enrollment.courseId === course.id && enrollment.status === 'active')
      .map((enrollment) => enrollment.studentId)
    if (studentIds.length && assignment.published) {
      notify({
        userIds: studentIds,
        type: 'assignment',
        title: `New assignment in ${course.code}`,
        body: assignment.title,
        link: `/app/assignments?assignment=${assignment.id}`,
      })
    }
    logActivity({
      type: 'assignment',
      actor: req.user,
      summary: `Published “${assignment.title}” for ${course.code}.`,
      targetType: 'assignment',
      targetId: assignment.id,
    })
    res.status(201).json({ assignment: assignmentView(assignment, req.user, db) })
  }),
)

router.get(
  '/assignments/:id',
  asyncHandler((req, res) => {
    const db = getDb()
    const assignment = assignmentOr404(req.params.id)
    if (!canSeeAssignment(req.user, assignment, db)) throw forbidden('You do not have access to this assignment.')
    const payload = { assignment: assignmentView(assignment, req.user, db) }
    if (canManageAssignment(req.user, assignment)) {
      payload.submissions = db.submissions
        .filter((submission) => submission.assignmentId === assignment.id)
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
        .map((submission) => submissionView(submission, req.user, db))
    }
    res.json(payload)
  }),
)

router.patch(
  '/assignments/:id',
  requireRole('teacher', 'admin'),
  asyncHandler((req, res) => {
    const db = getDb()
    const assignment = assignmentOr404(req.params.id)
    if (!canManageAssignment(req.user, assignment)) throw forbidden('You cannot edit this assignment.')
    const wasPublished = assignment.published !== false
    const input = assignmentInput(req.body, assignment)
    Object.assign(assignment, input, { updatedAt: new Date().toISOString(), preflight: null })
    save()

    if (!wasPublished && assignment.published) {
      const studentIds = db.enrollments
        .filter((enrollment) => enrollment.courseId === assignment.courseId && enrollment.status === 'active')
        .map((enrollment) => enrollment.studentId)
      if (studentIds.length) {
        notify({
          userIds: studentIds,
          type: 'assignment',
          title: `New assignment in ${courseFor(assignment, db)?.code || 'your course'}`,
          body: assignment.title,
          link: `/app/assignments?assignment=${assignment.id}`,
        })
      }
    }
    logActivity({
      type: 'assignment',
      actor: req.user,
      summary: `Updated “${assignment.title}” for ${courseFor(assignment, db)?.code || 'a course'}.`,
      targetType: 'assignment',
      targetId: assignment.id,
    })
    res.json({ assignment: assignmentView(assignment, req.user, db) })
  }),
)

router.post(
  '/assignments/:id/preflight',
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const db = getDb()
    const assignment = assignmentOr404(req.params.id)
    if (!canManageAssignment(req.user, assignment)) throw forbidden('You cannot verify this assignment.')
    const result = await preflightAssignment({
      assignment,
      course: courseFor(assignment, db),
      teacher: req.user,
    })
    assignment.preflight = {
      id: nextId('pf'),
      provider: result.provider,
      model: result.model,
      createdAt: new Date().toISOString(),
      byId: req.user.id,
      byName: req.user.name,
      usage: result.usage || null,
      result,
    }
    save()
    logActivity({
      type: 'audit',
      actor: req.user,
      summary: `Ran an AI preflight check on “${assignment.title}” — ${result.readiness === 'READY' ? 'ready' : 'needs work'}.`,
      targetType: 'assignment',
      targetId: assignment.id,
    })
    res.json({ preflight: assignment.preflight })
  }),
)

router.get(
  '/assignments/:id/submissions',
  requireRole('teacher', 'admin'),
  asyncHandler((req, res) => {
    const db = getDb()
    const assignment = assignmentOr404(req.params.id)
    if (!canManageAssignment(req.user, assignment)) throw forbidden('You cannot review this assignment.')
    res.json({
      assignment: assignmentView(assignment, req.user, db),
      submissions: db.submissions
        .filter((submission) => submission.assignmentId === assignment.id)
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
        .map((submission) => submissionView(submission, req.user, db)),
    })
  }),
)

/* -------------------------------- submissions ------------------------------ */

router.post(
  '/assignments/:id/submissions',
  requireRole('student'),
  uploadSingle('file'),
  asyncHandler(async (req, res) => {
    const db = getDb()
    const assignment = assignmentOr404(req.params.id)
    const course = courseFor(assignment, db)
    if (assignment.published === false) throw forbidden('This assignment is not open for submissions.')
    if (!enrolled(req.user.id, assignment.courseId, db)) {
      throw forbidden('You need to be enrolled in this course to submit work.')
    }

    const uploaded = inspectUpload(req.file)
    const pasted = String(req.body?.text || '').trim()
    if (!uploaded && pasted.length < 20) {
      throw badRequest('Attach a file or paste at least 20 characters of your response.')
    }
    if (!uploaded && pasted.length > 60_000) {
      throw badRequest('Pasted responses must be under 60,000 characters. Upload a file for longer work.')
    }

    const existing = db.submissions.find(
      (submission) => submission.assignmentId === assignment.id && submission.studentId === req.user.id,
    )
    const attempt = (existing?.attempt || 0) + 1
    if (attempt > 5) throw conflict('You have reached the five-attempt limit. Ask your teacher to review the existing work.')

    const now = new Date().toISOString()
    const submissionId = existing?.id || nextId('sub')
    const kind = uploaded?.kind || 'text'
    const fileName = uploaded?.fileName || `Pasted response ${attempt}.txt`
    const contentText = uploaded?.kind === 'text' ? uploaded.text : uploaded ? null : pasted
    let storageKey = null
    let storageDriver = 'inline'

    if (uploaded) {
      const safe = cleanFileName(fileName).replace(/[^a-zA-Z0-9._-]+/g, '-')
      const key = `${submissionId}-a${attempt}-${safe}`
      const stored = await storage.put({ key, buffer: uploaded.buffer, contentType: uploaded.mimeType, bucket: 'assignments' })
      storageKey = stored.key
      storageDriver = stored.driver
    }

    const payload = {
      id: submissionId,
      assignmentId: assignment.id,
      courseId: assignment.courseId,
      studentId: req.user.id,
      attempt,
      fileName,
      mimeType: uploaded?.mimeType || 'text/plain',
      size: uploaded?.size || Buffer.byteLength(pasted, 'utf8'),
      kind,
      storageDriver,
      storageKey,
      contentText,
      textExcerpt: String(contentText || '').replace(/\s+/g, ' ').trim().slice(0, 420),
      truncated: Boolean(uploaded?.truncated),
      submittedAt: now,
      updatedAt: now,
      late: Boolean(assignment.dueAt && new Date(now) > new Date(assignment.dueAt)),
      status: 'auditing',
      latestAuditId: null,
      teacherDecision: null,
      lastAuditError: null,
    }

    const previousKey = existing?.storageKey
    if (existing) Object.assign(existing, payload)
    else db.submissions.unshift(payload)
    const submission = existing || payload
    save()

    let audit = null
    let auditError = null
    let notice = null

    if (kind === 'binary' && !aiEnabled) {
      submission.status = 'awaiting_review'
      notice = 'Your file is saved. PDF/image vision needs GEMINI_API_KEY, so a teacher will review it manually.'
      save()
    } else {
      try {
        const source = await contentForAudit({
          ...submission,
          buffer: uploaded?.buffer,
          contentText,
          kind,
          mimeType: payload.mimeType,
        })
        const result = await auditSubmission({
          assignment,
          course,
          student: req.user,
          submission: source,
        })
        audit = makeAudit({ result, submission, actor: req.user })
        save()
      } catch (error) {
        submission.status = 'awaiting_review'
        submission.lastAuditError = error.message || 'The AI audit could not finish.'
        auditError = submission.lastAuditError
        save()
        if (previousKey && previousKey !== storageKey) await storage.remove(previousKey)
      }
    }

    if (previousKey && previousKey !== storageKey) await storage.remove(previousKey)

    notify({
      userIds: [assignment.teacherId],
      type: 'submission',
      title: `${course?.code || 'Course'} · new submission from ${req.user.name}`,
      body: audit
        ? `AI status: ${STATUS_LABEL[audit.result.overall_status] || audit.result.overall_status}. ${audit.result.summary || ''}`.trim()
        : auditError
          ? `Saved for manual review. AI audit issue: ${auditError}`
          : 'Saved for manual review — AI vision is not configured.',
      link: `/app/assignments?submission=${submission.id}`,
    })
    if (audit) {
      notify({
        userIds: [req.user.id],
        type: 'audit',
        title: `AI audit: ${STATUS_LABEL[audit.result.overall_status] || audit.result.overall_status}`,
        body: audit.result.summary || audit.result.rejection_feedback,
        link: `/app/assignments?assignment=${assignment.id}`,
      })
      if (audit.result.overall_status === 'REJECTED' || (audit.result.integrity_flags || []).length) {
        notifyAdmins({
          type: 'audit',
          title: `AI flagged a submission in ${course?.code || 'a course'}`,
          body: `${req.user.name} · ${assignment.title}${
            audit.result.integrity_flags?.length ? ` · ${audit.result.integrity_flags[0]}` : ''
          }`,
          link: `/app/assignments?submission=${submission.id}`,
        })
      }
    }
    logActivity({
      type: 'submission',
      actor: req.user,
      summary: `Submitted ${kind === 'binary' ? fileName : 'a written response'} for “${assignment.title}” in ${
        course?.code || 'a course'
      }${submission.late ? ' (late)' : ''}.`,
      targetType: 'submission',
      targetId: submission.id,
    })

    res.status(existing?.attempt > 1 ? 200 : 201).json({
      submission: submissionView(submission, req.user, db, { includeContent: true }),
      audit: auditView(audit),
      auditError,
      notice,
      meta: { ai: aiMeta() },
    })
  }),
)

router.get(
  '/submissions/:id',
  asyncHandler((req, res) => {
    const db = getDb()
    const submission = submissionOr404(req.params.id)
    const assignment = db.assignments.find((item) => item.id === submission.assignmentId)
    if (!canSeeSubmission(req.user, submission, assignment)) throw forbidden('You do not have access to this submission.')
    res.json({ submission: submissionView(submission, req.user, db, { includeContent: true }) })
  }),
)

router.get(
  '/submissions/:id/file',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const submission = submissionOr404(req.params.id)
    const assignment = db.assignments.find((item) => item.id === submission.assignmentId)
    if (!canSeeSubmission(req.user, submission, assignment)) throw forbidden('You do not have access to this file.')

    let buffer
    let contentType = submission.mimeType || 'application/octet-stream'
    if (submission.storageKey) {
      const bucket = submission.storageDriver === 'supabase' ? 'assignments' : 'default'
      const stored = await storage.get(submission.storageKey, bucket)
      buffer = stored.buffer
      if (!submission.mimeType) contentType = stored.contentType
    } else if (submission.contentText) {
      buffer = Buffer.from(submission.contentText, 'utf8')
      contentType = 'text/plain; charset=utf-8'
    } else {
      throw notFound('This submission has no stored file.')
    }

    const inline = /^(application\/pdf|image\/)/i.test(contentType)
    const name = cleanFileName(submission.fileName || 'submission')
    const asciiName = name.replace(/[^\x20-\x7e]+/g, '_').replace(/"/g, '')
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', buffer.length)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    )
    res.end(buffer)
  }),
)

router.post(
  '/submissions/:id/audit',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const submission = submissionOr404(req.params.id)
    const assignment = db.assignments.find((item) => item.id === submission.assignmentId)
    if (!canSeeSubmission(req.user, submission, assignment)) throw forbidden('You do not have access to this submission.')
    const manager = canManageAssignment(req.user, assignment)
    if (!manager && req.user.id !== submission.studentId) throw forbidden('You cannot run this audit.')
    if (!manager && submission.latestAuditId && !submission.lastAuditError) {
      throw conflict('This submission has already been audited. Submit a new attempt to get fresh feedback.')
    }

    const student = db.users.find((user) => user.id === submission.studentId)
    const course = courseFor(assignment, db)
    const teacherNote = manager ? String(req.body?.teacherNote || '').trim().slice(0, 2_000) : ''
    submission.status = 'auditing'
    save()

    try {
      const source = await contentForAudit(submission)
      const result = await auditSubmission({ assignment, course, student, submission: source, teacherNote })
      const audit = makeAudit({ result, submission, actor: req.user, teacherNote })
      save()
      const trigger = manager ? 'teacher' : 'student'
      notifyAuditResult({ submission, student, assignment, course, audit, actor: req.user, trigger })
      activityForAudit({ submission, student, assignment, course, audit, actor: req.user, trigger })
      res.json({
        submission: submissionView(submission, req.user, db, { includeContent: true }),
        audit: auditView(audit),
        meta: { ai: aiMeta() },
      })
    } catch (error) {
      submission.status = submission.teacherDecision
        ? 'reviewed'
        : submission.latestAuditId
          ? 'audited'
          : 'awaiting_review'
      submission.lastAuditError = error.message || 'The AI audit could not finish.'
      save()
      throw error
    }
  }),
)

router.patch(
  '/submissions/:id/decision',
  requireRole('teacher', 'admin'),
  asyncHandler((req, res) => {
    const db = getDb()
    const submission = submissionOr404(req.params.id)
    const assignment = db.assignments.find((item) => item.id === submission.assignmentId)
    if (!canManageAssignment(req.user, assignment)) throw forbidden('You cannot review this submission.')
    const status = String(req.body?.status || '').toUpperCase()
    if (!STATUSES.includes(status)) throw badRequest('Choose PASSED, NEEDS_REVISION or REJECTED.')
    const note = String(req.body?.note || '').replace(/\s+/g, ' ').trim().slice(0, 1_500)
    if (status !== 'PASSED' && note.length < 5) {
      throw badRequest('Add a short note so the student knows what to change.')
    }
    submission.teacherDecision = {
      status,
      note: note || 'Teacher reviewed and accepted this submission.',
      byId: req.user.id,
      byName: req.user.name,
      at: new Date().toISOString(),
    }
    submission.status = 'reviewed'
    submission.updatedAt = new Date().toISOString()
    save()

    const student = db.users.find((user) => user.id === submission.studentId)
    if (student) {
      notify({
        userIds: [student.id],
        type: 'audit',
        title: `Teacher review: ${STATUS_LABEL[status]}`,
        body: submission.teacherDecision.note,
        link: `/app/assignments?assignment=${assignment.id}`,
      })
    }
    logActivity({
      type: 'audit',
      actor: req.user,
      summary: `Reviewed ${student?.name || 'a student'}'s submission for “${assignment.title}” — ${STATUS_LABEL[status]}.`,
      targetType: 'submission',
      targetId: submission.id,
    })
    res.json({ submission: submissionView(submission, req.user, db, { includeContent: true }) })
  }),
)

export default router
