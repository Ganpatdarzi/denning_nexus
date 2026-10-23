import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  PageLoader,
  ProgressBar,
  Spinner,
  Stat,
  useToast,
} from '../components/Ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { cx, formatDate, relativeTime } from '../lib/format.js'

const STATUS_META = {
  PASSED: { label: 'Passed', tone: 'lime', icon: 'check' },
  NEEDS_REVISION: { label: 'Needs revision', tone: 'amber', icon: 'edit' },
  REJECTED: { label: 'Rejected', tone: 'rose', icon: 'flag' },
}

const CRITERION_TONE = { MET: 'lime', PARTIAL: 'amber', MISSING: 'rose' }
const DECISION_OPTIONS = ['PASSED', 'NEEDS_REVISION', 'REJECTED']

const providerLabel = (provider) => (provider === 'gemini' ? 'Gemini Flash' : 'Offline rubric check')

function statusMeta(status) {
  return STATUS_META[status] || { label: 'Awaiting review', tone: 'muted', icon: 'clock' }
}

function StatusBadge({ status, dot = false }) {
  const meta = statusMeta(status)
  return (
    <Badge tone={meta.tone} dot={dot}>
      {meta.label}
    </Badge>
  )
}

function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function dueLabel(value) {
  if (!value) return 'No deadline set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No deadline set'
  const diff = date.getTime() - Date.now()
  const days = Math.round(diff / 86_400_000)
  if (diff < 0) return `Due ${formatDate(value)} · closed`
  if (days === 0) return `Due today · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'Due tomorrow'
  return `Due ${formatDate(value)}`
}

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function openSubmissionFile(submission, toast) {
  try {
    const blob = await api.blob(`/submissions/${submission.id}/file`)
    const url = URL.createObjectURL(blob)
    const opened = window.open(url, '_blank', 'noopener')
    if (!opened) {
      const link = document.createElement('a')
      link.href = url
      link.download = submission.fileName || 'submission'
      document.body.appendChild(link)
      link.click()
      link.remove()
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    toast(error.message, 'error')
  }
}

/* ------------------------------- audit result ------------------------------ */

function AuditPanel({ submission }) {
  const audit = submission.audit
  const result = audit?.result
  const decision = submission.teacherDecision
  const effective = decision?.status || result?.overall_status

  if (!result && !decision) {
    return (
      <div className="audit-pending">
        <span className="audit-pending-icon">
          <Icon name="clock" size={20} />
        </span>
        <div>
          <h3>Awaiting the first review</h3>
          <p>
            {submission.lastAuditError
              ? submission.lastAuditError
              : 'This submission is saved. A teacher can run an AI check, or you can retry if a previous audit failed.'}
          </p>
        </div>
      </div>
    )
  }

  const meta = statusMeta(effective)
  return (
    <div className="audit-panel">
      {decision && (
        <div className={cx('teacher-decision', `teacher-decision-${statusMeta(decision.status).tone}`)}>
          <div>
            <p className="eyebrow">Teacher decision</p>
            <strong>{statusMeta(decision.status).label}</strong>
            <p>{decision.note}</p>
          </div>
          <span className="teacher-decision-by">
            {decision.byName} · {relativeTime(decision.at)}
          </span>
        </div>
      )}

      {result && (
        <>
          <div className={cx('audit-hero', `audit-hero-${meta.tone}`)}>
            <div className="audit-hero-copy">
              <div className="audit-hero-top">
                <StatusBadge status={result.overall_status} dot />
                <span className="audit-provider">{providerLabel(audit.provider)}</span>
                <span className="audit-confidence">{result.confidence} confidence</span>
              </div>
              <h3>{result.summary}</h3>
              <p>{result.rejection_feedback}</p>
            </div>
            <div className="audit-score">
              <strong>{result.score}</strong>
              <span>/ 100</span>
              <ProgressBar
                value={result.score}
                tone={result.overall_status === 'PASSED' ? 'cyan' : result.overall_status === 'REJECTED' ? 'rose' : 'amber'}
              />
            </div>
          </div>

          <div className="audit-meta-grid">
            <div>
              <span>Student on work</span>
              <strong>{result.extracted_data?.student_name || 'Not found'}</strong>
            </div>
            <div>
              <span>Student ID</span>
              <strong>{result.extracted_data?.student_id || 'Not found'}</strong>
            </div>
            <div>
              <span>Submitted date</span>
              <strong>{result.extracted_data?.submission_date || 'Not found'}</strong>
            </div>
            <div>
              <span>Format</span>
              <strong>{result.extracted_data?.detected_format || submission.mimeType || '—'}</strong>
            </div>
            <div>
              <span>Words read</span>
              <strong>{result.extracted_data?.word_count || '—'}</strong>
            </div>
            <div>
              <span>Checked</span>
              <strong>{relativeTime(audit.createdAt)}</strong>
            </div>
          </div>

          <div className="audit-check-row">
            <span className={result.rubric_verification?.all_questions_attempted ? 'check-yes' : 'check-no'}>
              <Icon name={result.rubric_verification?.all_questions_attempted ? 'check' : 'x'} size={13} />
              All questions attempted
            </span>
            <span className={result.rubric_verification?.source_code_included ? 'check-yes' : 'check-no'}>
              <Icon name={result.rubric_verification?.source_code_included ? 'check' : 'x'} size={13} />
              Source code present
            </span>
            <span className={result.rubric_verification?.formatting_compliant ? 'check-yes' : 'check-no'}>
              <Icon name={result.rubric_verification?.formatting_compliant ? 'check' : 'x'} size={13} />
              Formatting compliant
            </span>
            <span className="check-neutral">
              <Icon name="sparkles" size={13} />
              Clarity: {result.rubric_verification?.content_clarity_score || '—'}
            </span>
          </div>

          <section className="audit-rubric">
            <div className="section-head compact">
              <div>
                <p className="eyebrow">Rubric evidence</p>
                <h3>What the submission did — and did not — show</h3>
              </div>
              <Badge tone="muted">{result.rubric_verification?.criteria?.length || 0} criteria</Badge>
            </div>
            <div className="rubric-result-list">
              {(result.rubric_verification?.criteria || []).map((criterion) => (
                <article className="rubric-result" key={criterion.criterion}>
                  <div className="rubric-result-head">
                    <div>
                      <strong>{criterion.criterion}</strong>
                      <span>{criterion.weight}% weight</span>
                    </div>
                    <Badge tone={CRITERION_TONE[criterion.status] || 'muted'}>{criterion.status}</Badge>
                  </div>
                  <p className="rubric-evidence">
                    <Icon name="search" size={12} /> {criterion.evidence}
                  </p>
                  <p className="rubric-feedback">{criterion.feedback}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="audit-columns">
            <section className="audit-list-block">
              <h4>
                <span className="tone-lime">
                  <Icon name="check" size={14} />
                </span>
                What worked
              </h4>
              {result.strengths?.length ? (
                <ul>
                  {result.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">No strengths were called out in this pass.</p>
              )}
            </section>
            <section className="audit-list-block">
              <h4>
                <span className="tone-amber">
                  <Icon name="edit" size={14} />
                </span>
                Next actions
              </h4>
              {result.revision_actions?.length ? (
                <ol>
                  {result.revision_actions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              ) : (
                <p className="muted small">No revision actions. Keep the structure.</p>
              )}
            </section>
          </div>

          {result.integrity_flags?.length > 0 && (
            <div className="integrity-flags">
              <div>
                <Icon name="flag" size={16} />
                <strong>Integrity flags to check</strong>
              </div>
              <ul>
                {result.integrity_flags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            </div>
          )}

          {result.teacher_note && (
            <div className="ai-note">
              <p className="eyebrow">AI note for the teacher</p>
              <p>{result.teacher_note}</p>
            </div>
          )}

          <div className="audit-footer">
            <span>
              <Icon name="sparkles" size={13} /> {providerLabel(audit.provider)}
              {audit.model ? ` · ${audit.model}` : ''}
            </span>
            <p>AI is advisory. A teacher makes the final decision, and can override this status.</p>
          </div>
        </>
      )}
    </div>
  )
}

/* -------------------------------- preflight -------------------------------- */

function PreflightPanel({ preflight }) {
  if (!preflight) return null
  const result = preflight.result
  if (!result) return null
  const ready = result.readiness === 'READY'
  return (
    <div className="preflight-panel">
      <div className={cx('preflight-hero', ready ? 'preflight-ready' : 'preflight-work')}>
        <div>
          <div className="audit-hero-top">
            <Badge tone={ready ? 'lime' : 'amber'} dot>
              {ready ? 'Ready to publish' : 'Needs another pass'}
            </Badge>
            <span className="audit-provider">{providerLabel(preflight.provider)}</span>
          </div>
          <h3>{result.summary}</h3>
          <p>This checks clarity and gradeability. It does not change your pedagogy or publish the assignment.</p>
        </div>
        <div className="audit-score">
          <strong>{result.score}</strong>
          <span>/ 100</span>
          <ProgressBar value={result.score} tone={ready ? 'cyan' : 'amber'} />
        </div>
      </div>

      <div className="preflight-checks">
        {(result.checks || []).map((check) => (
          <div className={cx('preflight-check', check.passed ? 'pass' : 'fail')} key={check.label}>
            <span>
              <Icon name={check.passed ? 'check' : 'x'} size={13} />
            </span>
            <div>
              <strong>{check.label}</strong>
              <p>{check.note}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="audit-columns">
        <section className="audit-list-block">
          <h4>
            <span className="tone-lime">
              <Icon name="check" size={14} />
            </span>
            Already strong
          </h4>
          {result.strengths?.length ? (
            <ul>
              {result.strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No strengths returned.</p>
          )}
        </section>
        <section className="audit-list-block">
          <h4>
            <span className="tone-amber">
              <Icon name="flag" size={14} />
            </span>
            Gaps to close
          </h4>
          {result.gaps?.length ? (
            <ul>
              {result.gaps.map((gap) => (
                <li key={gap.title}>
                  <strong>{gap.title}</strong> — {gap.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No material gaps found.</p>
          )}
        </section>
      </div>

      {result.suggested_instructions && (
        <details className="suggested-brief">
          <summary>
            <Icon name="edit" size={13} /> Suggested brief improvements
          </summary>
          <p>{result.suggested_instructions}</p>
        </details>
      )}

      <div className="audit-footer">
        <span>
          <Icon name="sparkles" size={13} /> Teacher self-check
          {preflight.createdAt ? ` · ${relativeTime(preflight.createdAt)}` : ''}
        </span>
        <p>Apply suggestions by editing the assignment. The AI never changes your brief automatically.</p>
      </div>
    </div>
  )
}

/* ------------------------------ student modal ------------------------------ */

function StudentAssignmentModal({ assignment, meta, onClose, onChanged }) {
  const { toast } = useToast()
  const [submission, setSubmission] = useState(null)
  const [loading, setLoading] = useState(Boolean(assignment.viewerSubmission?.id))
  const [loadError, setLoadError] = useState(null)
  const [showForm, setShowForm] = useState(!assignment.viewerSubmission)
  const [mode, setMode] = useState('file')
  const [file, setFile] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const [notice, setNotice] = useState(null)

  const submissionId = assignment.viewerSubmission?.id
  const attempt = assignment.viewerSubmission?.attempt

  const loadSubmission = useCallback(async () => {
    if (!submissionId) {
      setSubmission(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const result = await api.get(`/submissions/${submissionId}`)
      setSubmission(result.submission)
    } catch (error) {
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }, [submissionId])

  useEffect(() => {
    loadSubmission()
  }, [loadSubmission, attempt])

  const accept = (meta?.upload?.acceptedExtensions || []).map((extension) => `.${extension}`).join(',')
  const maxMb = meta?.upload?.maxUploadMb || 10
  const canAuditBinary = meta?.ai?.enabled
  const currentStatus = submission?.effectiveStatus

  const submit = async (event) => {
    event.preventDefault()
    setFormError(null)
    setNotice(null)
    if (mode === 'file' && !file) {
      setFormError('Choose a file to submit.')
      return
    }
    if (mode === 'text' && text.trim().length < 20) {
      setFormError('Paste at least 20 characters of your response.')
      return
    }
    const form = new FormData()
    if (mode === 'file') form.append('file', file)
    else form.append('text', text)
    setBusy(true)
    try {
      const result = await api.upload(`/assignments/${assignment.id}/submissions`, form)
      setSubmission(result.submission)
      setNotice(result.notice || (result.auditError ? `Saved, but the AI check failed: ${result.auditError}` : null))
      if (result.auditError) toast(result.auditError, 'error')
      else toast('Submission saved and audited.', 'success')
      setShowForm(false)
      setFile(null)
      setText('')
      onChanged?.()
    } catch (error) {
      setFormError(error.message)
    } finally {
      setBusy(false)
    }
  }

  const retryAudit = async () => {
    if (!submission) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await api.post(`/submissions/${submission.id}/audit`, {})
      setSubmission(result.submission)
      toast('AI check finished.', 'success')
      onChanged?.()
    } catch (error) {
      setNotice(error.message)
      toast(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const course = assignment.course
  return (
    <Modal
      open
      onClose={onClose}
      title={assignment.title}
      description={`${course?.code || 'Course'} · ${course?.title || ''} · ${dueLabel(assignment.dueAt)}`}
      wide
      className="modal-xl"
    >
      <div className="assignment-modal">
        <section className="assignment-brief-pane">
          <div className="assignment-brief-top">
            <p className="eyebrow">The brief</p>
            <StatusBadge status={currentStatus} dot />
          </div>
          <p className="brief-copy">{assignment.instructions}</p>

          {assignment.requiredSections?.length > 0 && (
            <>
              <h4>Required sections</h4>
              <div className="chip-row">
                {assignment.requiredSections.map((section) => (
                  <span className="chip" key={section}>
                    {section}
                  </span>
                ))}
              </div>
            </>
          )}

          <h4>How it is assessed</h4>
          <div className="rubric-brief-list">
            {assignment.rubric.map((criterion) => (
              <div className="rubric-brief" key={criterion.id || criterion.label}>
                <div>
                  <strong>{criterion.label}</strong>
                  <span>{criterion.weight}%</span>
                </div>
                <p>{criterion.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="assignment-work-pane">
          {loading ? (
            <div className="audit-loading">
              <Spinner size={18} /> Opening your work…
            </div>
          ) : loadError ? (
            <ErrorState error={loadError} onRetry={loadSubmission} />
          ) : (
            <>
              {submission && (
                <div className="submission-current">
                  <div>
                    <p className="eyebrow">Your submission · attempt {submission.attempt}</p>
                    <strong>{submission.fileName}</strong>
                    <span>
                      {formatBytes(submission.size)} · submitted {relativeTime(submission.submittedAt)}
                      {submission.late ? ' · late' : ''}
                    </span>
                  </div>
                  <StatusBadge status={submission.effectiveStatus} />
                </div>
              )}

              {notice && (
                <div className="ai-callout compact-callout">
                  <Icon name="sparkles" size={16} />
                  <p>{notice}</p>
                </div>
              )}

              {submission && !showForm && (
                <div className="submission-actions">
                  <button className="btn btn-soft btn-sm" type="button" onClick={() => setShowForm(true)}>
                    <Icon name="plus" size={14} /> Submit a new attempt
                  </button>
                  {!submission.audit && (
                    <button className="btn btn-ghost btn-sm" type="button" onClick={retryAudit} disabled={busy}>
                      {busy ? <Spinner size={14} /> : <Icon name="sparkles" size={14} />} Run AI check
                    </button>
                  )}
                  {submission.fileUrl && (
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={() => openSubmissionFile(submission, toast)}
                    >
                      <Icon name="book" size={14} /> Open file
                    </button>
                  )}
                </div>
              )}

              {showForm && (
                <form className="submission-form" onSubmit={submit}>
                  <div className="submission-form-head">
                    <div>
                      <h4>{submission ? 'Submit a new attempt' : 'Submit your work'}</h4>
                      <p>
                        {submission
                          ? 'This replaces your current file. Earlier AI audits stay in the record.'
                          : 'A file or a pasted response. The AI reads it against the brief above.'}
                      </p>
                    </div>
                    {submission && (
                      <button className="icon-btn" type="button" onClick={() => setShowForm(false)} aria-label="Cancel">
                        <Icon name="x" size={16} />
                      </button>
                    )}
                  </div>

                  <div className="segmented">
                    <button className={mode === 'file' ? 'active' : ''} type="button" onClick={() => setMode('file')}>
                      <Icon name="book" size={13} /> Upload file
                    </button>
                    <button className={mode === 'text' ? 'active' : ''} type="button" onClick={() => setMode('text')}>
                      <Icon name="code" size={13} /> Paste text / code
                    </button>
                  </div>

                  {mode === 'file' ? (
                    <label
                      className={cx('drop-zone', file && 'has-file')}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        const dropped = event.dataTransfer.files?.[0]
                        if (dropped) setFile(dropped)
                      }}
                    >
                      <input
                        type="file"
                        accept={accept}
                        onChange={(event) => setFile(event.target.files?.[0] || null)}
                      />
                      <span className="drop-zone-icon">
                        <Icon name={file ? 'check' : 'plus'} size={20} />
                      </span>
                      <strong>{file ? file.name : 'Drop your PDF, image, or code file here'}</strong>
                      <p>
                        {file
                          ? `${formatBytes(file.size)} · ready to submit`
                          : `or click to browse. Up to ${maxMb} MB. PDF, PNG, JPG, WEBP, text and common code files.`}
                      </p>
                    </label>
                  ) : (
                    <label className="field">
                      <span>Your response</span>
                      <textarea
                        rows={12}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder="Paste your write-up, evidence, and source code here…"
                      />
                      <em className="field-hint">{text.length.toLocaleString()} / 60,000 characters</em>
                    </label>
                  )}

                  {mode === 'file' && file && !canAuditBinary && (
                    <p className="inline-warning">
                      <Icon name="clock" size={13} /> PDF/image vision is not configured. The file will be saved for
                      teacher review; pasted text/code can be checked offline.
                    </p>
                  )}
                  {mode === 'file' && file && canAuditBinary && (
                    <p className="inline-note">
                      <Icon name="sparkles" size={13} /> The AI will read the file, check the rubric, and return
                      evidence before your teacher reviews it.
                    </p>
                  )}
                  {formError && <p className="form-error">{formError}</p>}

                  <div className="submission-form-foot">
                    <span className="muted small">
                      AI feedback is advisory. Your teacher makes the final academic decision.
                    </span>
                    <button className="btn btn-primary" type="submit" disabled={busy}>
                      {busy ? <Spinner size={15} /> : <Icon name="sparkles" size={15} />}
                      {busy ? 'Reading your submission…' : canAuditBinary || mode === 'text' ? 'Submit & run AI audit' : 'Submit for review'}
                    </button>
                  </div>
                </form>
              )}

              {submission && <AuditPanel submission={submission} />}
              {!submission && !showForm && (
                <EmptyState
                  icon="cap"
                  title="Nothing submitted yet"
                  description="Choose a file or paste your response above."
                  action={
                    <button className="btn btn-primary btn-sm" type="button" onClick={() => setShowForm(true)}>
                      Start submission
                    </button>
                  }
                />
              )}
            </>
          )}
        </section>
      </div>
    </Modal>
  )
}

/* ------------------------------ brief modal -------------------------------- */

function BriefModal({ assignment, onClose, onEdit, onPreflight, onReview }) {
  return (
    <Modal
      open
      onClose={onClose}
      title={assignment.title}
      description={`${assignment.course?.code || 'Course'} · ${assignment.course?.title || ''} · ${dueLabel(assignment.dueAt)}`}
      wide
      className="modal-lg"
      footer={
        <>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-soft btn-sm" type="button" onClick={() => onPreflight(assignment)}>
            <Icon name="sparkles" size={14} /> AI preflight
          </button>
          {onEdit && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => onEdit(assignment)}>
              <Icon name="edit" size={14} /> Edit
            </button>
          )}
          <button className="btn btn-primary btn-sm" type="button" onClick={() => onReview(assignment)}>
            <Icon name="users" size={14} /> Review submissions
          </button>
        </>
      }
    >
      <div className="assignment-brief-modal">
        <div className="brief-meta">
          <Badge tone="muted">{assignment.rubric.length} rubric criteria</Badge>
          <Badge tone="muted">{assignment.submissionCount} submissions</Badge>
          <Badge tone={assignment.preflight?.result?.readiness === 'READY' ? 'lime' : 'amber'}>
            {assignment.preflight ? `Preflight: ${assignment.preflight.result?.readiness === 'READY' ? 'ready' : 'needs work'}` : 'Not preflighted'}
          </Badge>
        </div>
        <p className="brief-copy">{assignment.instructions}</p>
        <h4>Required sections</h4>
        <div className="chip-row">
          {(assignment.requiredSections || []).map((section) => (
            <span className="chip" key={section}>
              {section}
            </span>
          ))}
        </div>
        <h4>Rubric</h4>
        <div className="rubric-brief-list">
          {assignment.rubric.map((criterion) => (
            <div className="rubric-brief" key={criterion.id || criterion.label}>
              <div>
                <strong>{criterion.label}</strong>
                <span>{criterion.weight}%</span>
              </div>
              <p>{criterion.description}</p>
            </div>
          ))}
        </div>
        {assignment.preflight && (
          <div className="last-preflight">
            <p className="eyebrow">Last AI preflight</p>
            <span>{relativeTime(assignment.preflight.createdAt)} by {assignment.preflight.byName}</span>
            <Badge tone={assignment.preflight.result?.readiness === 'READY' ? 'lime' : 'amber'}>
              {assignment.preflight.result?.readiness === 'READY' ? 'Ready' : 'Needs work'}
            </Badge>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------ preflight modal ---------------------------- */

function PreflightModal({ state, onClose, onRun }) {
  const { assignment, value, loading, error } = state
  return (
    <Modal
      open
      onClose={onClose}
      title="Teacher AI preflight"
      description={`${assignment.course?.code || 'Course'} · ${assignment.title}`}
      wide
      className="modal-lg"
      footer={
        <>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-soft btn-sm" type="button" onClick={onRun} disabled={loading}>
            {loading ? <Spinner size={14} /> : <Icon name="sparkles" size={14} />}
            {loading ? 'Checking the brief…' : value ? 'Re-run preflight' : 'Run preflight'}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="audit-loading tall">
          <Spinner size={20} />
          <p>Reading the brief, sections and rubric for gaps…</p>
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={onRun} />
      ) : value ? (
        <PreflightPanel preflight={value} />
      ) : (
        <EmptyState
          icon="sparkles"
          title="Check before students start"
          description="The preflight agent checks that the brief, required sections and rubric are clear enough to grade consistently."
          action={
            <button className="btn btn-primary btn-sm" type="button" onClick={onRun}>
              Run AI preflight
            </button>
          }
        />
      )}
    </Modal>
  )
}

/* ------------------------------- review modal ------------------------------ */

function ReviewModal({ submissionId, meta, onClose, onChanged }) {
  const { toast } = useToast()
  const [submission, setSubmission] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('NEEDS_REVISION')
  const [note, setNote] = useState('')
  const [teacherNote, setTeacherNote] = useState('')
  const [reauditing, setReauditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.get(`/submissions/${submissionId}`)
      const detail = result.submission
      setSubmission(detail)
      setStatus(detail.teacherDecision?.status || detail.effectiveStatus || 'NEEDS_REVISION')
      setNote(detail.teacherDecision?.note || '')
    } catch (loadError) {
      setError(loadError)
    } finally {
      setLoading(false)
    }
  }, [submissionId])

  useEffect(() => {
    load()
  }, [load])

  const reaudit = async () => {
    setReauditing(true)
    try {
      const result = await api.post(`/submissions/${submission.id}/audit`, { teacherNote })
      setSubmission(result.submission)
      setStatus(
        result.submission.teacherDecision?.status || result.submission.effectiveStatus || status,
      )
      toast('AI re-check finished.', 'success')
      onChanged?.()
    } catch (auditError) {
      toast(auditError.message, 'error')
    } finally {
      setReauditing(false)
    }
  }

  const saveDecision = async () => {
    setSaving(true)
    try {
      const result = await api.patch(`/submissions/${submission.id}/decision`, { status, note })
      setSubmission(result.submission)
      setStatus(result.submission.teacherDecision?.status || status)
      toast('Teacher decision saved and sent to the student.', 'success')
      onChanged?.()
    } catch (decisionError) {
      toast(decisionError.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Review submission"
      description={submission ? `${submission.course?.code || 'Course'} · ${submission.assignment?.title || ''}` : 'Loading the submitted work…'}
      wide
      className="modal-xl"
      footer={
        submission ? (
          <>
            <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
              Close
            </button>
            <button className="btn btn-primary btn-sm" type="button" onClick={saveDecision} disabled={saving}>
              {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              {saving ? 'Saving…' : 'Save teacher decision'}
            </button>
          </>
        ) : null
      }
    >
      {loading ? (
        <div className="audit-loading tall">
          <Spinner size={20} /> Opening the submission…
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={load} />
      ) : submission ? (
        <div className="review-modal">
          <div className="review-student-card">
            <div className="review-student">
              <Avatar person={submission.student} size={42} />
              <div>
                <strong>{submission.student?.name}</strong>
                <span>{submission.student?.email}</span>
              </div>
            </div>
            <div className="review-stats">
              <div>
                <span>Attempt</span>
                <strong>{submission.attempt}</strong>
              </div>
              <div>
                <span>Submitted</span>
                <strong>{relativeTime(submission.submittedAt)}</strong>
              </div>
              <div>
                <span>File</span>
                <strong>{submission.fileName}</strong>
              </div>
              <div>
                <span>Size</span>
                <strong>{formatBytes(submission.size)}</strong>
              </div>
            </div>
            <div className="review-student-actions">
              {submission.late && <Badge tone="rose">Late</Badge>}
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => openSubmissionFile(submission, toast)}
              >
                <Icon name="book" size={14} /> Open submitted file
              </button>
            </div>
          </div>

          {submission.contentText && (
            <details className="submission-content" open>
              <summary>
                <Icon name="code" size={14} /> Student response
              </summary>
              <pre>{submission.contentText}</pre>
            </details>
          )}

          <AuditPanel submission={submission} />

          <div className="review-controls">
            <div className="review-reaudit">
              <div>
                <p className="eyebrow">AI re-check</p>
                <h4>Give the audit a focus</h4>
                <p>Optional: point the agent at a specific rubric concern or section.</p>
              </div>
              <div className="review-reaudit-actions">
                <input
                  value={teacherNote}
                  onChange={(event) => setTeacherNote(event.target.value)}
                  placeholder="e.g. Check whether the testing evidence is real…"
                  maxLength={500}
                />
                <button className="btn btn-soft btn-sm" type="button" onClick={reaudit} disabled={reauditing}>
                  {reauditing ? <Spinner size={14} /> : <Icon name="sparkles" size={14} />}
                  {reauditing ? 'Re-reading…' : 'Re-run AI'}
                </button>
              </div>
            </div>

            <div className="decision-panel">
              <div>
                <p className="eyebrow">Final decision</p>
                <h4>Override or confirm the AI</h4>
                <p>Your decision is what the student sees as the final outcome.</p>
              </div>
              <div className="decision-options">
                {DECISION_OPTIONS.map((option) => (
                  <button
                    key={option}
                    className={cx('decision-option', `decision-${statusMeta(option).tone}`, status === option && 'active')}
                    type="button"
                    onClick={() => setStatus(option)}
                  >
                    <StatusBadge status={option} />
                    <span>
                      {option === 'PASSED'
                        ? 'Accept the work'
                        : option === 'NEEDS_REVISION'
                          ? 'Ask for another pass'
                          : 'Do not accept'}
                    </span>
                  </button>
                ))}
              </div>
              <label className="field">
                <span>Note to the student</span>
                <textarea
                  rows={4}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={
                    status === 'PASSED'
                      ? 'Optional note. Defaults to teacher reviewed and accepted.'
                      : 'What should the student change before resubmitting?'
                  }
                  maxLength={1500}
                />
              </label>
              {status !== 'PASSED' && note.trim().length < 5 && (
                <p className="inline-warning">
                  <Icon name="flag" size={13} /> Add a short note for revision or rejection decisions.
                </p>
              )}
            </div>
          </div>

          <div className="audit-footer">
            <span>
              <Icon name="sparkles" size={13} /> {meta?.ai?.enabled ? 'Gemini Flash is configured' : 'Offline rubric mode is active'}
            </span>
            <p>The teacher decision is stored separately from the AI output, so the AI cannot overwrite your judgement.</p>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

/* ------------------------------ editor modal ------------------------------- */

function AssignmentEditorModal({ assignment, courses, onClose, onSaved }) {
  const { toast } = useToast()
  const [form, setForm] = useState(() => ({
    courseId: assignment?.course?.id || courses[0]?.id || '',
    title: assignment?.title || '',
    instructions: assignment?.instructions || '',
    requiredSections: (assignment?.requiredSections || []).join('\n'),
    rubric: (assignment?.rubric || [])
      .map((criterion) => `${criterion.label} | ${criterion.description} | ${criterion.weight}`)
      .join('\n'),
    dueAt: toLocalInput(assignment?.dueAt),
    published: assignment?.published !== false,
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    const rubric = form.rubric
      .split(/\r?\n/)
      .map((line) => {
        const [label, description, weight] = line.split('|').map((part) => part?.trim())
        return { label, description, weight: Number(weight) || 10 }
      })
      .filter((item) => item.label)
    if (!rubric.length) {
      setError('Add at least one rubric line.')
      return
    }
    const payload = {
      courseId: form.courseId,
      title: form.title,
      instructions: form.instructions,
      requiredSections: form.requiredSections
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      rubric,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      published: form.published,
    }
    setSaving(true)
    try {
      if (assignment) await api.patch(`/assignments/${assignment.id}`, payload)
      else await api.post('/assignments', payload)
      toast(assignment ? 'Assignment updated.' : 'Assignment published.', 'success')
      onSaved?.()
      onClose()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={assignment ? 'Edit assignment' : 'New assignment'}
      description={
        assignment
          ? 'Instruction changes clear the last AI preflight so you can verify the new version.'
          : 'Create the brief and rubric students will be audited against.'
      }
      wide
      className="modal-lg"
    >
      <form className="assignment-editor" onSubmit={submit}>
        <div className="form-grid tight">
          <label className="field">
            <span>Course</span>
            <select value={form.courseId} onChange={(event) => set('courseId', event.target.value)} required>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} · {course.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Due date</span>
            <input
              type="datetime-local"
              value={form.dueAt}
              onChange={(event) => set('dueAt', event.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span>Assignment title</span>
          <input
            value={form.title}
            onChange={(event) => set('title', event.target.value)}
            placeholder="e.g. Campus Club API — Milestone 1"
            maxLength={160}
            required
          />
        </label>

        <label className="field">
          <span>Brief</span>
          <textarea
            rows={7}
            value={form.instructions}
            onChange={(event) => set('instructions', event.target.value)}
            placeholder="What should students produce? Name the deliverable, the evidence, and the rules."
            required
          />
          <em className="field-hint">{form.instructions.length.toLocaleString()} characters. The AI audits against this brief.</em>
        </label>

        <label className="field">
          <span>Required sections (one per line)</span>
          <textarea
            rows={5}
            value={form.requiredSections}
            onChange={(event) => set('requiredSections', event.target.value)}
            placeholder={'Cover page\nAPI design\nImplementation\nTesting evidence\nReflection'}
          />
        </label>

        <label className="field">
          <span>Rubric</span>
          <textarea
            rows={7}
            value={form.rubric}
            onChange={(event) => set('rubric', event.target.value)}
            placeholder={'API design | Four endpoints with request and response shapes | 25\nTesting evidence | Three real requests with expected responses | 20'}
          />
          <em className="field-hint">
            One criterion per line: <strong>Criterion | Observable evidence | Weight</strong>. The labels are sent to
            the AI verbatim.
          </em>
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(event) => set('published', event.target.checked)}
          />
          <span>
            <strong>Published</strong>
            <em>Students enrolled in this course can see and submit to it.</em>
          </span>
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? <Spinner size={15} /> : <Icon name="check" size={15} />}
            {saving ? 'Saving…' : assignment ? 'Save changes' : 'Publish assignment'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* --------------------------------- page ----------------------------------- */

export default function Assignments() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [reviewId, setReviewId] = useState(null)
  const [brief, setBrief] = useState(null)
  const [editor, setEditor] = useState(null)
  const [preflightState, setPreflightState] = useState(null)
  const [queueFilter, setQueueFilter] = useState('all')
  const deepLinkRef = useRef('')

  const courseFilter = searchParams.get('course') || ''
  const isStudent = user.role === 'student'
  const isManager = user.role === 'teacher' || user.role === 'admin'

  const load = useCallback(async () => {
    setError(null)
    try {
      const query = courseFilter ? `?course=${encodeURIComponent(courseFilter)}` : ''
      const result = await api.get(`/assignments${query}`)
      setData(result)
    } catch (loadError) {
      setError(loadError)
    }
  }, [courseFilter])

  useEffect(() => {
    load()
  }, [load])

  const clearDeepLink = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('assignment')
    next.delete('submission')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!data) return
    const assignmentParam = searchParams.get('assignment')
    const submissionParam = searchParams.get('submission')
    const key = `${assignmentParam || ''}:${submissionParam || ''}`
    if (!assignmentParam && !submissionParam) return
    if (deepLinkRef.current === key) return
    deepLinkRef.current = key
    if (submissionParam && isManager) setReviewId(submissionParam)
    else if (assignmentParam && isStudent) setActiveId(assignmentParam)
    else if (assignmentParam && isManager) {
      const found = data.assignments.find((assignment) => assignment.id === assignmentParam)
      if (found) setBrief(found)
    }
  }, [data, searchParams, isManager, isStudent])

  const activeAssignment = data?.assignments.find((assignment) => assignment.id === activeId) || null

  const runPreflight = useCallback(
    async (assignment) => {
      setPreflightState({ assignment, loading: true, value: assignment.preflight || null })
      try {
        const result = await api.post(`/assignments/${assignment.id}/preflight`)
        setPreflightState({ assignment, loading: false, value: result.preflight })
        toast('AI preflight complete.', 'success')
        await load()
      } catch (preflightError) {
        setPreflightState({ assignment, loading: false, error: preflightError })
        toast(preflightError.message, 'error')
      }
    },
    [load, toast],
  )

  const openPreflight = (assignment) => {
    if (assignment.preflight) setPreflightState({ assignment, value: assignment.preflight })
    else runPreflight(assignment)
  }

  const closeReview = () => {
    setReviewId(null)
    clearDeepLink()
  }

  const openReview = (assignment) => {
    const first = data?.submissions?.find((submission) => submission.assignmentId === assignment.id)
    setBrief(null)
    if (first) setReviewId(first.id)
    else toast('No submissions for this assignment yet.', 'error')
  }

  const closeBrief = () => {
    setBrief(null)
    clearDeepLink()
  }

  const openEditor = (assignment = null) => {
    setBrief(null)
    setEditor({ assignment })
  }

  const queue = useMemo(() => {
    if (!data?.submissions) return []
    const filtered = data.submissions.filter((submission) => {
      const status = submission.teacherDecision?.status || submission.aiStatus
      if (queueFilter === 'awaiting') return !submission.teacherDecision
      if (queueFilter === 'revision') return status === 'NEEDS_REVISION' || status === 'REJECTED'
      if (queueFilter === 'passed') return status === 'PASSED'
      return true
    })
    return filtered
  }, [data, queueFilter])

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!data) return <PageLoader label="Opening coursework and AI audits…" />

  const { assignments, stats, meta } = data
  const eyebrow = isStudent ? 'Coursework · AI audit' : user.role === 'admin' ? 'Campus oversight · AI audits' : 'Teaching studio · AI verification'
  const title = isStudent
    ? 'Submit work that knows the rubric.'
    : user.role === 'admin'
      ? 'See what the AI sees.'
      : 'Check the brief. Then check the work.'
  const description = isStudent
    ? 'Upload a PDF, image, or code file. Gemini Flash reads it against your brief, shows the evidence, and sends it to your teacher for the final call.'
    : user.role === 'admin'
      ? 'Every AI audit, teacher override and flagged submission across the campus — in one place.'
      : 'Run an AI preflight on your brief and rubric, then review submissions with rubric evidence, integrity flags, and your own override.'

  const headerActions = (
    <>
      {courseFilter && (
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => {
            const next = new URLSearchParams(searchParams)
            next.delete('course')
            setSearchParams(next, { replace: true })
          }}
        >
          <Icon name="x" size={14} /> Clear course filter
        </button>
      )}
      {isStudent ? (
        <Badge tone={meta.ai.enabled ? 'lime' : 'amber'} dot>
          {meta.ai.enabled ? 'Gemini audit live' : 'Offline rubric mode'}
        </Badge>
      ) : user.role === 'teacher' ? (
        <button className="btn btn-primary btn-sm" type="button" onClick={() => openEditor()} disabled={!data.courses.length}>
          <Icon name="plus" size={14} /> New assignment
        </button>
      ) : (
        <Badge tone="iris" dot>
          Admin visibility
        </Badge>
      )}
    </>
  )

  return (
    <div className="page assignments-page">
      <PageHeader eyebrow={eyebrow} title={title} description={description} actions={headerActions} />

      <div className={cx('ai-callout', meta.ai.enabled ? 'ai-callout-live' : '')}>
        <span className="ai-callout-icon">
          <Icon name="sparkles" size={18} />
        </span>
        <div>
          <strong>{meta.ai.enabled ? 'Gemini Flash audit agent is active' : 'Offline rubric mode'}</strong>
          <p>{meta.ai.note}</p>
        </div>
        <Badge tone={meta.ai.enabled ? 'lime' : 'amber'}>{meta.upload.maxUploadMb} MB max</Badge>
      </div>

      <div className="stat-grid">
        {isStudent ? (
          <>
            <Stat label="Assignments" value={stats.assignments} hint="open in your courses" icon="cap" />
            <Stat label="Submitted" value={stats.submitted} hint="with a current attempt" icon="check" tone="cyan" />
            <Stat label="Passed" value={stats.passed} hint="AI or teacher accepted" icon="award" tone="lime" />
            <Stat
              label="Needs revision"
              value={stats.needsRevision + stats.rejected}
              hint={stats.awaiting ? `${stats.awaiting} awaiting review` : 'no open revisions'}
              icon="edit"
              tone={stats.needsRevision + stats.rejected ? 'amber' : 'default'}
            />
          </>
        ) : (
          <>
            <Stat label="Assignments" value={stats.assignments} hint="in your courses" icon="cap" />
            <Stat label="Submissions" value={stats.submissions} hint="all attempts" icon="book" tone="cyan" />
            <Stat
              label="Awaiting review"
              value={stats.awaitingReview}
              hint={stats.awaitingReview ? 'no AI audit yet' : 'queue clear'}
              icon="clock"
              tone={stats.awaitingReview ? 'amber' : 'default'}
            />
            <Stat
              label="Needs revision"
              value={stats.needsRevision + stats.rejected}
              hint={stats.rejected ? `${stats.rejected} rejected` : 'AI or teacher flagged'}
              icon="flag"
              tone={stats.needsRevision + stats.rejected ? 'rose' : 'default'}
            />
          </>
        )}
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          icon="cap"
          title={isStudent ? 'No assignments yet' : 'No assignments in this filter'}
          description={
            isStudent
              ? 'When a teacher publishes coursework for one of your courses, it lands here.'
              : 'Create an assignment to start collecting auditable submissions.'
          }
          action={
            user.role === 'teacher' && data.courses.length ? (
              <button className="btn btn-primary btn-sm" type="button" onClick={() => openEditor()}>
                Create an assignment
              </button>
            ) : null
          }
        />
      ) : (
        <div className="assignment-card-grid">
          {assignments.map((assignment) => {
            const submission = assignment.viewerSubmission
            const effective = submission?.teacherDecision?.status || submission?.aiStatus
            const preflight = assignment.preflight?.result
            return (
              <article className="assignment-card" key={assignment.id}>
                <div className="assignment-card-top">
                  <span className="assignment-course">
                    <span className="course-dot" />
                    {assignment.course?.code || 'Course'}
                  </span>
                  {isStudent ? <StatusBadge status={effective} /> : (
                    <Badge tone={preflight ? (preflight.readiness === 'READY' ? 'lime' : 'amber') : 'muted'}>
                      {preflight ? `Preflight ${preflight.score}` : 'Not preflighted'}
                    </Badge>
                  )}
                </div>
                <h3>{assignment.title}</h3>
                <p className="assignment-due">
                  <Icon name="clock" size={13} /> {dueLabel(assignment.dueAt)}
                  {assignment.teacher && <span> · {assignment.teacher.name}</span>}
                </p>
                <p className="assignment-blurb">{assignment.instructions}</p>
                <div className="chip-row">
                  {(assignment.requiredSections || []).slice(0, 3).map((section) => (
                    <span className="chip" key={section}>
                      {section}
                    </span>
                  ))}
                  {assignment.requiredSections?.length > 3 && (
                    <span className="chip">+{assignment.requiredSections.length - 3}</span>
                  )}
                </div>

                {isStudent ? (
                  <div className="assignment-card-foot">
                    <div>
                      <span className="assignment-mini-label">
                        {submission ? `Attempt ${submission.attempt}` : 'Not submitted'}
                      </span>
                      <span className="assignment-mini-value">
                        {submission ? relativeTime(submission.submittedAt) : `${assignment.rubric.length} rubric criteria`}
                      </span>
                    </div>
                    <button className="btn btn-soft btn-sm" type="button" onClick={() => setActiveId(assignment.id)}>
                      {submission ? 'Open submission' : 'Start assignment'} <Icon name="chevron-right" size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="assignment-card-foot manager-foot">
                    <div className="assignment-mini-stats">
                      <span>
                        <strong>{assignment.submissionCount}</strong> submitted
                      </span>
                      <span>
                        <strong>{assignment.pendingCount}</strong> need attention
                      </span>
                    </div>
                    <div className="manager-card-actions">
                      <button className="btn btn-ghost btn-xs" type="button" onClick={() => setBrief(assignment)}>
                        View brief
                      </button>
                      <button className="btn btn-ghost btn-xs" type="button" onClick={() => openPreflight(assignment)}>
                        <Icon name="sparkles" size={13} /> {assignment.preflight ? 'View preflight' : 'AI preflight'}
                      </button>
                      {user.role === 'teacher' && (
                        <button className="btn btn-ghost btn-xs" type="button" onClick={() => openEditor(assignment)}>
                          <Icon name="edit" size={13} /> Edit
                        </button>
                      )}
                      <button className="btn btn-soft btn-xs" type="button" onClick={() => openReview(assignment)}>
                        Review {assignment.submissionCount > 0 ? assignment.submissionCount : ''}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {isManager && (
        <section className="review-queue-section">
          <div className="section-head compact">
            <div>
              <p className="eyebrow">Review queue</p>
              <h2>Every submission, with its evidence</h2>
            </div>
            <div className="segmented small">
              {[
                ['all', 'All', data.submissions.length],
                ['awaiting', 'Awaiting', data.submissions.filter((item) => !item.teacherDecision).length],
                ['revision', 'Revision', data.submissions.filter((item) => ['NEEDS_REVISION', 'REJECTED'].includes(item.teacherDecision?.status || item.aiStatus)).length],
                ['passed', 'Passed', data.submissions.filter((item) => (item.teacherDecision?.status || item.aiStatus) === 'PASSED').length],
              ].map(([key, label, count]) => (
                <button
                  className={queueFilter === key ? 'active' : ''}
                  type="button"
                  key={key}
                  onClick={() => setQueueFilter(key)}
                >
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>
          </div>

          {queue.length === 0 ? (
            <EmptyState
              icon="sparkles"
              title={data.submissions.length ? 'Nothing in this filter' : 'The queue is quiet'}
              description={
                data.submissions.length
                  ? 'Try another filter to see the rest of the submissions.'
                  : 'When students submit work, the AI audit and your review controls appear here.'
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table review-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Assignment</th>
                    <th>Submitted</th>
                    <th>AI audit</th>
                    <th>Final status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {queue.map((submission) => {
                    const finalStatus = submission.teacherDecision?.status || submission.aiStatus
                    return (
                      <tr key={submission.id}>
                        <td>
                          <div className="table-person">
                            <Avatar person={submission.student} size={32} />
                            <div>
                              <strong>{submission.student?.name}</strong>
                              <span>{submission.student?.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong className="table-title">{submission.assignment?.title || 'Assignment'}</strong>
                          <span className="muted small">{submission.course?.code} · attempt {submission.attempt}</span>
                        </td>
                        <td>
                          <span className="muted small">{relativeTime(submission.submittedAt)}</span>
                          {submission.late && <Badge tone="rose">Late</Badge>}
                        </td>
                        <td>
                          {submission.aiStatus ? (
                            <div className="queue-status">
                              <StatusBadge status={submission.aiStatus} />
                              <span>{submission.audit?.result?.score ?? '—'}/100</span>
                            </div>
                          ) : (
                            <Badge tone="muted" dot>No audit</Badge>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={finalStatus} dot={Boolean(submission.teacherDecision)} />
                          {submission.teacherDecision && <span className="muted small">overridden</span>}
                        </td>
                        <td>
                          <button className="btn btn-soft btn-xs" type="button" onClick={() => setReviewId(submission.id)}>
                            Review
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeAssignment && isStudent && (
        <StudentAssignmentModal
          key={activeAssignment.id}
          assignment={activeAssignment}
          meta={meta}
          onClose={() => setActiveId(null)}
          onChanged={load}
        />
      )}

      {brief && isManager && (
        <BriefModal
          assignment={brief}
          onClose={closeBrief}
          onEdit={user.role === 'teacher' ? (assignment) => openEditor(assignment) : null}
          onPreflight={(assignment) => {
            closeBrief()
            openPreflight(assignment)
          }}
          onReview={openReview}
        />
      )}

      {preflightState && (
        <PreflightModal
          state={preflightState}
          onClose={() => setPreflightState(null)}
          onRun={() => runPreflight(preflightState.assignment)}
        />
      )}

      {reviewId && (
        <ReviewModal
          key={reviewId}
          submissionId={reviewId}
          meta={meta}
          onClose={closeReview}
          onChanged={load}
        />
      )}

      {editor && (
        <AssignmentEditorModal
          key={editor.assignment?.id || 'new'}
          assignment={editor.assignment}
          courses={data.courses}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
