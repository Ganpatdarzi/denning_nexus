import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import {
  Avatar,
  Badge,
  ErrorState,
  Modal,
  PageHeader,
  PageLoader,
  Spinner,
  Stat,
  useToast,
} from '../components/Ui.jsx'
import {
  AiVerdictBadge,
  AiVerdictPanel,
  ApplicationStatusBadge,
} from '../components/Verification.jsx'
import { api } from '../lib/api.js'
import { cx, formatDate, relativeTime } from '../lib/format.js'

const FILTERS = [
  { key: 'pending', label: 'Needs review' },
  { key: 'denied', label: 'Denied by AI' },
  { key: 'approved', label: 'Approved' },
  { key: 'all', label: 'All applications' },
]

const DECISIONS = [
  {
    key: 'approve',
    label: 'Approve access',
    icon: 'check',
    tone: 'lime',
    copy: 'Activate the teacher account and open the faculty workspace.',
  },
  {
    key: 'request_more',
    label: 'Request more documents',
    icon: 'mail',
    tone: 'amber',
    copy: 'The teacher can upload another document and the AI will run again.',
  },
  {
    key: 'reject',
    label: 'Reject application',
    icon: 'x',
    tone: 'rose',
    copy: 'Close this application. The applicant can apply again later.',
  },
]

function isPending(application) {
  return ['pending_ai_review', 'pending_admin_review', 'rejected_by_ai'].includes(application.status)
}

function isDeniedByAi(application) {
  return application.aiVerdict?.verdict === 'AI_DENIED'
}

function formatSize(bytes = 0) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AdminVerifications() {
  const { toast } = useToast()
  const [applications, setApplications] = useState([])
  const [counts, setCounts] = useState({ total: 0, pending: 0, aiDenied: 0, approved: 0 })
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('pending')
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [decision, setDecision] = useState(null)
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  const [preview, setPreview] = useState(null)

  const load = useCallback(() => {
    setError(null)
    return api
      .get('/admin/teacher-verifications')
      .then((data) => {
        setApplications(data.applications)
        setCounts(data.counts)
        setMeta(data.meta)
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(
    () => () => {
      if (preview?.objectUrl) URL.revokeObjectURL(preview.url)
    },
    [preview],
  )

  const active = applications.find((application) => application.id === activeId) || null

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return applications.filter((application) => {
      if (filter === 'pending' && !isPending(application)) return false
      if (filter === 'denied' && !isDeniedByAi(application)) return false
      if (filter === 'approved' && application.status !== 'approved') return false
      if (!needle) return true
      const applicant = application.applicant || {}
      return (
        (applicant.name || application.applicantName || '').toLowerCase().includes(needle) ||
        (applicant.email || application.email || '').toLowerCase().includes(needle) ||
        (application.headline || '').toLowerCase().includes(needle)
      )
    })
  }, [applications, filter, query])

  const openReview = (application) => {
    setActiveId(application.id)
    setDecision(null)
    setNote('')
    setPreview(null)
  }

  const closeReview = () => {
    setActiveId(null)
    setDecision(null)
    setNote('')
    setPreview(null)
  }

  const openDocument = async (application, document) => {
    setPreview({ url: null, docId: document.id, loading: true, error: '', mimeType: document.mimeType })
    if (document.demo || !document.storageKey) {
      setPreview({
        url: null,
        docId: document.id,
        loading: false,
        mimeType: document.mimeType,
        error: 'This seeded application uses a placeholder document. No file was stored with the demo data.',
      })
      return
    }
    try {
      const data = await api.get(
        `/admin/teacher-verifications/${application.id}/file/${document.id}`,
      )
      if (data.url) {
        setPreview({ url: data.url, docId: document.id, loading: false, mimeType: document.mimeType })
        return
      }
      const blob = await api.blob(
        `/admin/teacher-verifications/${application.id}/file/${document.id}/raw`,
      )
      const url = URL.createObjectURL(blob)
      setPreview({ url, docId: document.id, loading: false, mimeType: document.mimeType, objectUrl: true })
    } catch (requestError) {
      setPreview({
        url: null,
        docId: document.id,
        loading: false,
        mimeType: document.mimeType,
        error: requestError.message,
      })
    }
  }

  const submitDecision = async () => {
    if (!active || !decision) return
    setWorking(true)
    try {
      await api.patch(`/admin/teacher-verifications/${active.id}/decision`, { decision, note })
      toast(
        decision === 'approve'
          ? `${active.applicant?.name || active.applicantName} now has faculty access.`
          : decision === 'reject'
            ? 'Application rejected. The teacher has been notified.'
            : 'Requested another document. The teacher has been notified.',
      )
      closeReview()
      await load()
    } catch (requestError) {
      toast(requestError.message, 'error')
    } finally {
      setWorking(false)
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />
  if (loading) return <PageLoader label="Opening teacher verification…" />

  const aiEnabled = meta?.ai?.enabled
  const decisionNeedsNote = decision === 'reject' || decision === 'request_more'
  const canSubmit = Boolean(decision) && !working && (!decisionNeedsNote || note.trim().length >= 5)

  return (
    <div className="page">
      <PageHeader
        eyebrow="Trust & safety"
        title="Teacher verification, with a human in the loop."
        description="Every applicant uploads an ID, licence, or qualification. The AI checks the document first; you make the final call — including overriding an AI denial."
        actions={
          <Link className="btn btn-ghost btn-sm" to="/app/admin">
            <Icon name="arrow-left" size={15} /> Campus pulse
          </Link>
        }
      />

      <div className="stats-row verify-stats">
        <Stat
          label="Needs a decision"
          value={counts.pending}
          hint="AI checks that are waiting for an administrator"
          icon="clock"
          tone={counts.pending ? 'amber' : 'default'}
        />
        <Stat
          label="Denied by AI"
          value={counts.aiDenied}
          hint="Specific document problems found — override any time"
          icon="flag"
          tone={counts.aiDenied ? 'rose' : 'default'}
        />
        <Stat
          label="Approved"
          value={counts.approved}
          hint="Faculty accounts cleared for access"
          icon="check"
          tone="lime"
        />
        <Stat
          label="All applications"
          value={counts.total}
          hint="Full verification audit trail"
          icon="shield"
          tone="iris"
        />
      </div>

      {meta && (
        <div className={cx('verify-mode', aiEnabled ? 'live' : 'offline')}>
          <Icon name={aiEnabled ? 'sparkles' : 'user'} size={15} />
          <span>
            {aiEnabled ? (
              <>
                Document vision is live with <strong>{meta.ai.model}</strong>. AI verdicts are advisory;
                every decision is recorded against the administrator who made it.
              </>
            ) : (
              <>
                <strong>Manual review mode.</strong> GEMINI_API_KEY is not configured, so documents are
                queued as “needs human review” and are never auto-denied.
              </>
            )}
          </span>
        </div>
      )}

      <div className="filter-bar">
        <div className="filter-row">
          <div className="field-pills">
            {FILTERS.map((item) => {
              const count =
                item.key === 'pending'
                  ? counts.pending
                  : item.key === 'denied'
                    ? counts.aiDenied
                    : item.key === 'approved'
                      ? counts.approved
                      : counts.total
              return (
                <button
                  key={item.key}
                  className={cx('pill', filter === item.key && 'active')}
                  onClick={() => setFilter(item.key)}
                  type="button"
                >
                  {item.label} <span className="pill-count">{count}</span>
                </button>
              )
            })}
          </div>
          <form className="inline-search" onSubmit={(event) => event.preventDefault()}>
            <Icon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search applicant or email…"
              aria-label="Search teacher applications"
            />
          </form>
        </div>
      </div>

      <div className="card verify-list-card">
        <div className="table-wrap">
          <table className="table verify-table">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>AI verdict</th>
                <th>Application</th>
                <th>Documents</th>
                <th>Submitted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((application) => (
                <tr key={application.id} className={cx(isDeniedByAi(application) && 'verify-row-denied')}>
                  <td>
                    <div className="table-person">
                      <Avatar person={application.applicant || { name: application.applicantName }} size={36} />
                      <div>
                        <strong>{application.applicant?.name || application.applicantName}</strong>
                        <span>{application.applicant?.email || application.email}</span>
                        {application.applicant?.fieldSlug && (
                          <em className="verify-field">{application.applicant.fieldSlug}</em>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="verify-cell-stack">
                      {application.aiVerdict ? (
                        <AiVerdictBadge
                          verdict={application.aiVerdict.verdict}
                          confidence={application.aiVerdict.confidence}
                        />
                      ) : (
                        <Badge tone="muted">Not run</Badge>
                      )}
                      {isDeniedByAi(application) && (
                        <em className="verify-ai-note">Admin review still required</em>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="verify-cell-stack">
                      <ApplicationStatusBadge status={application.status} />
                      {application.status === 'approved' && isDeniedByAi(application) && (
                        <em className="verify-ai-note">AI denial overridden by admin</em>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="muted small">{application.documents?.length || 0} file(s)</span>
                  </td>
                  <td>
                    <span className="muted small">{relativeTime(application.createdAt)}</span>
                  </td>
                  <td>
                    <button
                      className={cx(
                        'btn btn-xs',
                        isPending(application) || isDeniedByAi(application) ? 'btn-primary' : 'btn-soft',
                      )}
                      onClick={() => openReview(application)}
                      type="button"
                    >
                      {isPending(application) || isDeniedByAi(application) ? 'Review' : 'Open'}
                      <Icon name="arrow-right" size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="verify-empty">
            <Icon name="shield" size={22} />
            <h3>No applications in this view.</h3>
            <p className="muted small">
              {filter === 'pending'
                ? 'Every application has a decision. A quiet queue is a good queue.'
                : 'Try another filter or clear the search.'}
            </p>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(active)}
        onClose={closeReview}
        title={active ? `Review ${active.applicant?.name || active.applicantName}` : 'Review application'}
        description={
          active
            ? `Applied ${formatDate(active.createdAt)} · ${active.documents?.length || 0} document(s) · ${active.email || active.applicant?.email}`
            : undefined
        }
        wide
        className="verify-review-modal"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={closeReview} type="button">
              Close
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={submitDecision}
              disabled={!canSubmit}
              type="button"
            >
              {working ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              {decision === 'approve'
                ? 'Approve faculty access'
                : decision === 'reject'
                  ? 'Reject application'
                  : decision === 'request_more'
                    ? 'Send document request'
                    : 'Choose a decision'}
            </button>
          </>
        }
      >
        {active && (
          <div className="verify-review">
            <div className="verify-applicant">
              <Avatar person={active.applicant || { name: active.applicantName }} size={46} />
              <div>
                <strong>{active.applicant?.name || active.applicantName}</strong>
                <span>{active.applicant?.email || active.email}</span>
                <em>
                  {active.headline || active.applicant?.headline || 'Teacher applicant'}
                  {active.applicant?.fieldSlug ? ` · ${active.applicant.fieldSlug}` : ''}
                </em>
              </div>
              <div className="verify-applicant-badges">
                <ApplicationStatusBadge status={active.status} />
                <Badge tone={active.applicant?.status === 'active' ? 'lime' : 'muted'} dot>
                  Account {active.applicant?.status || 'pending'}
                </Badge>
              </div>
            </div>

            {active.aiVerdict ? (
              <AiVerdictPanel ai={active.aiVerdict} />
            ) : (
              <div className="verify-no-ai">
                <Icon name="sparkles" size={16} />
                <span>No AI verdict is stored for this application.</span>
              </div>
            )}

            <section className="verify-documents">
              <div className="section-head">
                <h3>Documents</h3>
                <span className="muted small">Private · opened with short-lived links</span>
              </div>
              <ul>
                {(active.documents || []).map((document) => (
                  <li key={document.id}>
                    <span className="verify-doc-icon">
                      <Icon name={document.mimeType === 'application/pdf' ? 'book' : 'award'} size={16} />
                    </span>
                    <div>
                      <strong>{document.fileName}</strong>
                      <span>
                        {formatSize(document.size)} · uploaded {relativeTime(document.uploadedAt)}
                      </span>
                    </div>
                    {document.demo ? (
                      <Badge tone="muted">Seed placeholder</Badge>
                    ) : (
                      <button
                        className="btn btn-soft btn-xs"
                        onClick={() => openDocument(active, document)}
                        type="button"
                      >
                        <Icon name="search" size={12} /> Preview
                      </button>
                    )}
                  </li>
                ))}
                {(active.documents || []).length === 0 && (
                  <li className="verify-doc-empty">No documents attached.</li>
                )}
              </ul>

              {preview && (
                <div className="verify-preview">
                  <div className="verify-preview-head">
                    <strong>Document preview</strong>
                    <button className="icon-btn" onClick={() => setPreview(null)} type="button" aria-label="Close preview">
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                  {preview.loading && (
                    <div className="audit-loading">
                      <Spinner size={18} /> Opening the private document…
                    </div>
                  )}
                  {preview.error && <p className="muted small pad">{preview.error}</p>}
                  {preview.url && preview.mimeType?.startsWith('image/') && (
                    <img src={preview.url} alt="Verification document" className="verify-preview-image" />
                  )}
                  {preview.url && preview.mimeType === 'application/pdf' && (
                    <iframe src={preview.url} title="Verification document" className="verify-preview-frame" />
                  )}
                  {preview.url && (
                    <a className="text-link" href={preview.url} target="_blank" rel="noreferrer">
                      Open in a new tab <Icon name="arrow-right" size={13} />
                    </a>
                  )}
                </div>
              )}
            </section>

            <section className="verify-decision">
              <div className="section-head">
                <h3>Your decision</h3>
                <span className="muted small">The AI is advisory. You are the final reviewer.</span>
              </div>

              {isDeniedByAi(active) && (
                <div className="verify-override">
                  <Icon name="flag" size={15} />
                  <span>
                    The AI denied this application. Approving it records an explicit override on the
                    audit trail — review the document and reasons first.
                  </span>
                </div>
              )}

              <div className="verify-decision-grid">
                {DECISIONS.map((option) => (
                  <button
                    key={option.key}
                    className={cx('verify-choice', `tone-${option.tone}`, decision === option.key && 'active')}
                    onClick={() => setDecision(option.key)}
                    type="button"
                  >
                    <span className="verify-choice-icon">
                      <Icon name={option.icon} size={16} />
                    </span>
                    <span>
                      <strong>{option.label}</strong>
                      <em>{option.copy}</em>
                    </span>
                  </button>
                ))}
              </div>

              <label className="field">
                <span>
                  Decision note {decisionNeedsNote ? <em className="muted small">(required)</em> : <em className="muted small">(optional)</em>}
                </span>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={
                    decision === 'approve'
                      ? 'Optional context for the audit trail.'
                      : decision === 'reject'
                        ? 'Tell the applicant what was wrong and how to reapply.'
                        : 'Tell the applicant exactly which document to upload next.'
                  }
                  maxLength={1200}
                />
              </label>

              {active.decisionHistory?.length > 0 && (
                <details className="verify-history">
                  <summary>Earlier decisions ({active.decisionHistory.length})</summary>
                  <ul>
                    {active.decisionHistory.map((item, index) => (
                      <li key={`${item.at}-${index}`}>
                        <strong>{item.decision.replaceAll('_', ' ')}</strong>
                        <span>{item.note || 'No note.'}</span>
                        <em>
                          {item.byName} · {formatDate(item.at)}
                        </em>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          </div>
        )}
      </Modal>
    </div>
  )
}
