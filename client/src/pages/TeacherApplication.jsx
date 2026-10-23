import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { PageLoader, Spinner, useToast } from '../components/Ui.jsx'
import { AiVerdictPanel, ApplicationStatusBadge, statusMeta } from '../components/Verification.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { cx, formatDate, relativeTime } from '../lib/format.js'

const STATUS_COPY = {
  none: {
    title: 'Add the documents behind your application.',
    body: 'Upload one clear ID, teaching licence, degree, or qualification. The AI reads it first, then an administrator makes the final decision.',
  },
  pending_ai_review: {
    title: 'Your documents are being checked.',
    body: 'The AI is reading the file now. This usually takes a few seconds.',
  },
  pending_admin_review: {
    title: 'Your application is with an administrator.',
    body: 'The AI check is complete. An administrator will review the documents and either approve you, ask for more, or decline.',
  },
  rejected_by_ai: {
    title: 'The AI could not approve this document.',
    body: 'An administrator can still review and override the AI. You can also upload a clearer or more relevant document now.',
  },
  needs_more_documents: {
    title: 'An administrator needs another document.',
    body: 'Read the note below, then upload a document that answers it. Your earlier files stay in the audit trail.',
  },
  rejected: {
    title: 'This application was not approved.',
    body: 'You can apply again with stronger documents. Read the administrator note first.',
  },
  approved: {
    title: 'You are approved.',
    body: 'Your faculty workspace is open.',
  },
}

const UPLOADABLE = ['rejected_by_ai', 'needs_more_documents', 'rejected']

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function TeacherApplication() {
  const { user, booting, logout, refreshUser } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const fileInput = useRef(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const payload = await api.get('/teacher-applications/me')
      setData(payload)
      if (payload.account?.status === 'active') await refreshUser()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [refreshUser])

  useEffect(() => {
    if (user && user.role === 'teacher' && user.status !== 'active') load()
  }, [load, user])

  if (booting) return <PageLoader label="Opening your application…" />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'teacher') {
    return <Navigate to={user.role === 'admin' ? '/app/admin' : '/app'} replace />
  }
  if (user.status === 'active') return <Navigate to="/app/teach" replace />

  const application = data?.application || null
  const meta = data?.meta || null
  const status = application?.status || 'none'
  const copy = STATUS_COPY[status] || STATUS_COPY.none
  const canUpload = !application || UPLOADABLE.includes(status)
  const ai = application?.aiVerdict || null

  const chooseFile = (next) => {
    setError('')
    if (!next) {
      setFile(null)
      return
    }
    const extension = next.name.split('.').pop()?.toLowerCase()
    if (!['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
      setError('Choose a PDF, PNG, JPG, or WEBP file.')
      return
    }
    if (meta?.upload?.maxUploadMb && next.size > meta.upload.maxUploadMb * 1024 * 1024) {
      setError(`Keep the file under ${meta.upload.maxUploadMb} MB.`)
      return
    }
    setFile(next)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!file) {
      setError('Choose a document to upload first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('document', file)
      const result = await api.upload('/teacher-applications', form)
      setData((current) => ({
        ...current,
        application: result.application,
        meta: result.meta || current?.meta,
      }))
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      const verdict = result.ai?.verdict
      toast(
        verdict === 'AI_DENIED'
          ? 'Document received. The AI flagged it, so an administrator will review it.'
          : verdict === 'AI_APPROVED'
            ? 'Document received. The AI found no blocking issues; an administrator makes the final call.'
            : 'Document received. An administrator will review your application.',
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const signOut = () => {
    logout()
    navigate('/')
  }

  const steps = [
    { label: 'Account created', detail: 'Your teacher profile exists.', done: true },
    {
      label: 'Documents uploaded',
      detail: application ? `${application.documents?.length || 0} file(s) on record` : 'Waiting for your first upload',
      done: Boolean(application),
    },
    {
      label: 'AI document check',
      detail: ai ? `${ai.verdict?.replaceAll('_', ' ')} · ${ai.confidence?.toLowerCase()} confidence` : 'Queued',
      done: Boolean(ai),
      active: status === 'pending_ai_review',
    },
    {
      label: 'Administrator decision',
      detail: application?.adminDecision
        ? `${application.adminDecision.byName} · ${relativeTime(application.adminDecision.at)}`
        : 'A human always makes the final call',
      done: Boolean(application?.adminDecision),
      active: status === 'pending_admin_review',
    },
    {
      label: 'Faculty workspace',
      detail: 'Unlocks when an administrator approves you.',
      done: application?.status === 'approved',
    },
  ]

  return (
    <div className="apply-page">
      <header className="apply-topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <span />
          </span>
          <span className="brand-word">
            Denning<em>Nexus</em>
          </span>
        </Link>
        <div className="apply-account">
          <span>
            <strong>{user.name}</strong>
            <em>{user.email}</em>
          </span>
          <button className="btn btn-ghost btn-sm" onClick={signOut} type="button">
            <Icon name="logout" size={15} /> Sign out
          </button>
        </div>
      </header>

      <main className="apply-main">
        <section className="apply-intro">
          <p className="eyebrow">Faculty verification</p>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
          <div className="apply-status-line">
            <ApplicationStatusBadge status={application?.status || 'draft'} />
            {application?.updatedAt && (
              <span className="muted small">Updated {relativeTime(application.updatedAt)}</span>
            )}
            {meta?.ai && (
              <span className={cx('apply-ai-state', meta.ai.enabled ? 'live' : 'offline')}>
                <Icon name={meta.ai.enabled ? 'sparkles' : 'user'} size={13} />
                {meta.ai.enabled ? `AI document check · ${meta.ai.model}` : 'Manual review mode (AI key not configured)'}
              </span>
            )}
          </div>
        </section>

        {loading ? (
          <div className="apply-loading">
            <Spinner size={22} />
            <span>Reading your application…</span>
          </div>
        ) : (
          <div className="apply-grid">
            <div className="apply-column">
              {error && (
                <div className="form-error">
                  <Icon name="flag" size={15} /> {error}
                </div>
              )}

              {ai && <AiVerdictPanel ai={ai} />}

              {application?.adminDecision && (
                <section className={cx('apply-decision', `tone-${statusMeta(application.status).tone}`)}>
                  <span className="apply-decision-icon">
                    <Icon
                      name={
                        application.adminDecision.decision === 'approve'
                          ? 'check'
                          : application.adminDecision.decision === 'request_more'
                            ? 'mail'
                            : 'flag'
                      }
                      size={16}
                    />
                  </span>
                  <div>
                    <h3>Administrator note</h3>
                    <p>{application.adminDecision.note || 'No note added.'}</p>
                    <em>
                      {application.adminDecision.byName} · {formatDate(application.adminDecision.at)}
                    </em>
                  </div>
                </section>
              )}

              {application?.decisionHistory?.length > 0 && (
                <details className="apply-history">
                  <summary>Earlier decisions ({application.decisionHistory.length})</summary>
                  <ul>
                    {application.decisionHistory.map((decision, index) => (
                      <li key={`${decision.at}-${index}`}>
                        <strong>{decision.decision.replaceAll('_', ' ')}</strong>
                        <span>{decision.note || 'No note.'}</span>
                        <em>
                          {decision.byName} · {formatDate(decision.at)}
                        </em>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {canUpload && (
                <section className="card apply-upload-card">
                  <div className="card-head-row">
                    <div>
                      <h3>{application ? 'Upload another document' : 'Upload your verification document'}</h3>
                      <p className="muted small">
                        One clear PDF or image per upload. Identity documents stay private and are only
                        visible to administrators.
                      </p>
                    </div>
                    <Icon name="lock" size={18} />
                  </div>

                  <form onSubmit={submit} className="apply-upload-form">
                    <label
                      className={cx('apply-drop', dragging && 'dragging', file && 'has-file')}
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDragging(true)
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(event) => {
                        event.preventDefault()
                        setDragging(false)
                        chooseFile(event.dataTransfer.files?.[0] || null)
                      }}
                    >
                      <input
                        ref={fileInput}
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                        onChange={(event) => chooseFile(event.target.files?.[0] || null)}
                      />
                      <span className="apply-drop-icon">
                        <Icon name={file ? 'check' : 'upload'} size={22} />
                      </span>
                      <strong>{file ? file.name : 'Drop a document here, or choose a file'}</strong>
                      <em>
                        {file
                          ? `${formatSize(file.size)} · ready to upload`
                          : `PDF, PNG, JPG or WEBP · up to ${meta?.upload?.maxUploadMb || 10} MB`}
                      </em>
                    </label>

                    <div className="apply-upload-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setFile(null)
                          if (fileInput.current) fileInput.current.value = ''
                        }}
                        disabled={!file || busy}
                        type="button"
                      >
                        Clear
                      </button>
                      <button className="btn btn-primary btn-sm" disabled={!file || busy} type="submit">
                        {busy ? <Spinner size={14} /> : <Icon name="sparkles" size={14} />}
                        {busy ? 'Reading document…' : 'Upload & run AI check'}
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {application?.documents?.length > 0 && (
                <section className="card apply-docs-card">
                  <div className="card-head-row">
                    <h3>Documents on file</h3>
                    <span className="muted small">Private · administrators only</span>
                  </div>
                  <ul className="apply-doc-list">
                    {application.documents.map((doc) => (
                      <li key={doc.id}>
                        <span className="apply-doc-icon">
                          <Icon name="book" size={15} />
                        </span>
                        <div>
                          <strong>{doc.fileName}</strong>
                          <span>
                            {formatSize(doc.size)} · uploaded {relativeTime(doc.uploadedAt)}
                          </span>
                        </div>
                        <Icon name="lock" size={14} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <aside className="apply-side">
              <section className="card apply-progress">
                <h3>Application progress</h3>
                <ol className="apply-steps">
                  {steps.map((step) => (
                    <li
                      key={step.label}
                      className={cx(step.done && 'done', step.active && 'active')}
                    >
                      <span className="apply-step-mark">
                        {step.active ? <Spinner size={11} /> : <Icon name={step.done ? 'check' : 'clock'} size={12} />}
                      </span>
                      <div>
                        <strong>{step.label}</strong>
                        <em>{step.detail}</em>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="card apply-help">
                <h3>How verification works</h3>
                <div>
                  <span>1</span>
                  <p>
                    <strong>You upload a document.</strong> The file goes to private storage — never a
                    public link.
                  </p>
                </div>
                <div>
                  <span>2</span>
                  <p>
                    <strong>The AI reads it for a first pass.</strong> It extracts fields, checks the name
                    and document type, and looks for red flags.
                  </p>
                </div>
                <div>
                  <span>3</span>
                  <p>
                    <strong>An administrator decides.</strong> The AI never has the final word, and an
                    administrator can override a denial.
                  </p>
                </div>
              </section>

              <section className="card apply-profile-note">
                <h3>What we are checking</h3>
                <ul>
                  <li>Your name matches the document.</li>
                  <li>The document is a real ID, licence, degree, or qualification.</li>
                  <li>The file is readable and complete.</li>
                  <li>The credential is relevant to {user.fieldSlug || 'your teaching field'}.</li>
                </ul>
                <p className="muted small">
                  Questions? Contact the campus administrator at admin@denning.edu.
                </p>
              </section>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
