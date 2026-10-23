import { getDb } from '../db/store.js'

export function personCard(user) {
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    accent: user.accent,
    role: user.role,
  }
}

export function courseSummary(course) {
  if (!course) return null
  const db = getDb()
  const teacher = db.users.find((user) => user.id === course.teacherId)
  return {
    id: course.id,
    code: course.code,
    title: course.title,
    teacher: personCard(teacher),
  }
}

export function latestAuditFor(submission, db = getDb()) {
  if (!submission?.latestAuditId) return null
  return db.audits.find((audit) => audit.id === submission.latestAuditId) || null
}

export function effectiveStatus(submission) {
  if (!submission) return null
  return submission.teacherDecision?.status || submission.latestAudit?.result?.overall_status || null
}

export function submissionSummary(submission, db = getDb()) {
  if (!submission) return null
  const audit = latestAuditFor(submission, db)
  return {
    id: submission.id,
    attempt: submission.attempt || 1,
    status: submission.status,
    submittedAt: submission.submittedAt,
    late: Boolean(submission.late),
    fileName: submission.fileName,
    mimeType: submission.mimeType,
    size: submission.size,
    aiStatus: audit?.result?.overall_status || null,
    effectiveStatus: submission.teacherDecision?.status || audit?.result?.overall_status || null,
    score: audit?.result?.score ?? null,
    reviewed: Boolean(submission.teacherDecision),
    teacherDecision: submission.teacherDecision || null,
    lastAuditError: submission.lastAuditError || null,
  }
}

export function auditView(audit) {
  if (!audit) return null
  return {
    id: audit.id,
    provider: audit.provider,
    model: audit.model,
    promptVersion: audit.promptVersion,
    createdAt: audit.createdAt,
    triggeredByName: audit.triggeredByName,
    teacherNote: audit.teacherNote || '',
    usage: audit.usage || null,
    result: audit.result,
  }
}

export function assignmentView(assignment, viewer, db = getDb()) {
  const course = db.courses.find((item) => item.id === assignment.courseId)
  const teacher = db.users.find((user) => user.id === assignment.teacherId)
  const submissions = db.submissions.filter((submission) => submission.assignmentId === assignment.id)
  const latest = viewer.role === 'student'
    ? submissions.find((submission) => submission.studentId === viewer.id)
    : null
  const pending = submissions.filter((submission) => {
    const audit = latestAuditFor(submission, db)
    return !submission.teacherDecision && (!audit || audit.result?.overall_status !== 'PASSED')
  }).length

  return {
    id: assignment.id,
    title: assignment.title,
    instructions: assignment.instructions,
    requiredSections: assignment.requiredSections || [],
    rubric: assignment.rubric || [],
    dueAt: assignment.dueAt,
    published: assignment.published !== false,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    course: courseSummary(course),
    teacher: personCard(teacher),
    submissionCount: submissions.length,
    pendingCount: pending,
    preflight: assignment.preflight || null,
    viewerSubmission: latest ? submissionSummary(latest, db) : null,
    canManage: viewer.role === 'admin' || (viewer.role === 'teacher' && assignment.teacherId === viewer.id),
  }
}

export function submissionView(submission, viewer, db = getDb(), { includeContent = false } = {}) {
  const assignment = db.assignments.find((item) => item.id === submission.assignmentId)
  const course = db.courses.find((item) => item.id === submission.courseId)
  const student = db.users.find((user) => user.id === submission.studentId)
  const audit = latestAuditFor(submission, db)
  const audits = db.audits
    .filter((item) => item.submissionId === submission.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(auditView)
  const canManage =
    viewer.role === 'admin' || (viewer.role === 'teacher' && assignment?.teacherId === viewer.id)

  return {
    id: submission.id,
    assignmentId: submission.assignmentId,
    courseId: submission.courseId,
    attempt: submission.attempt || 1,
    fileName: submission.fileName,
    mimeType: submission.mimeType,
    size: submission.size,
    kind: submission.kind || 'text',
    submittedAt: submission.submittedAt,
    updatedAt: submission.updatedAt,
    late: Boolean(submission.late),
    status: submission.status,
    truncated: Boolean(submission.truncated),
    lastAuditError: submission.lastAuditError || null,
    assignment: assignment
      ? {
          id: assignment.id,
          title: assignment.title,
          dueAt: assignment.dueAt,
          instructions: assignment.instructions,
          requiredSections: assignment.requiredSections || [],
          rubric: assignment.rubric || [],
          teacher: personCard(db.users.find((user) => user.id === assignment.teacherId)),
        }
      : null,
    course: courseSummary(course),
    student: personCard(student),
    audit: auditView(audit),
    audits,
    aiStatus: audit?.result?.overall_status || null,
    effectiveStatus: submission.teacherDecision?.status || audit?.result?.overall_status || null,
    teacherDecision: submission.teacherDecision || null,
    canManage,
    canAudit:
      viewer.role === 'admin' ||
      viewer.role === 'teacher' ||
      (viewer.role === 'student' && submission.studentId === viewer.id),
    fileUrl: submission.storageKey || submission.contentText ? `/api/submissions/${submission.id}/file` : null,
    textExcerpt: submission.textExcerpt || '',
    ...(includeContent
      ? {
          contentText: submission.contentText || '',
        }
      : {}),
  }
}
