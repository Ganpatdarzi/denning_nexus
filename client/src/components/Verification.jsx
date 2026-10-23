import Icon from './Icon.jsx'
import { Badge } from './Ui.jsx'
import { cx } from '../lib/format.js'

export const VERDICT_META = {
  AI_APPROVED: {
    label: 'AI approved',
    tone: 'lime',
    icon: 'check',
    blurb: 'The AI found no blocking issues. An administrator still makes the final call.',
  },
  AI_NEEDS_REVIEW: {
    label: 'Needs human review',
    tone: 'amber',
    icon: 'clock',
    blurb: 'The AI could not decide safely, so this application is queued for an administrator.',
  },
  AI_DENIED: {
    label: 'Denied by AI',
    tone: 'rose',
    icon: 'flag',
    blurb: 'The AI found specific document problems. An administrator can still override this.',
  },
}

export const APPLICATION_STATUS = {
  draft: { label: 'Documents needed', tone: 'muted', icon: 'upload' },
  pending_ai_review: { label: 'AI check in progress', tone: 'cyan', icon: 'sparkles' },
  pending_admin_review: { label: 'Waiting for admin', tone: 'amber', icon: 'clock' },
  rejected_by_ai: { label: 'Denied by AI', tone: 'rose', icon: 'flag' },
  needs_more_documents: { label: 'More documents requested', tone: 'amber', icon: 'mail' },
  approved: { label: 'Approved', tone: 'lime', icon: 'check' },
  rejected: { label: 'Not approved', tone: 'rose', icon: 'x' },
}

const EXTRACTED_LABELS = {
  fullName: 'Full name',
  documentType: 'Document type',
  documentNumber: 'Document number',
  issuingInstitution: 'Issuing institution',
  issueDate: 'Issued',
  expiryDate: 'Expires',
  country: 'Country',
}

export function verdictMeta(verdict) {
  return (
    VERDICT_META[verdict] || {
      label: 'AI review pending',
      tone: 'muted',
      icon: 'sparkles',
      blurb: 'No AI verdict has been recorded yet.',
    }
  )
}

export function statusMeta(status) {
  return APPLICATION_STATUS[status] || { label: status || 'Unknown', tone: 'muted', icon: 'clock' }
}

export function AiVerdictBadge({ verdict, confidence, className = '' }) {
  const meta = verdictMeta(verdict)
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
      {confidence ? <span className="verify-confidence"> · {confidence.toLowerCase()}</span> : null}
    </Badge>
  )
}

export function ApplicationStatusBadge({ status, dot = true }) {
  const meta = statusMeta(status)
  return (
    <Badge tone={meta.tone} dot={dot}>
      {meta.label}
    </Badge>
  )
}

/**
 * The same AI result is shown to the applicant and to administrators. The
 * wording deliberately keeps the human decision as the authority.
 */
export function AiVerdictPanel({ ai, className = '', title = 'AI document check' }) {
  if (!ai) return null
  const meta = verdictMeta(ai.verdict)
  const extracted = Object.entries(ai.extracted || {}).filter(([, value]) => String(value || '').trim())
  const checks = Array.isArray(ai.checks) ? ai.checks : []
  const reasons = Array.isArray(ai.reasons) ? ai.reasons : []
  const redFlags = Array.isArray(ai.redFlags) ? ai.redFlags : []

  return (
    <section className={cx('verify-ai', `verify-ai-${meta.tone}`, className)}>
      <header className="verify-ai-head">
        <span className={cx('verify-ai-icon', `tone-${meta.tone}`)}>
          <Icon name={meta.icon} size={18} />
        </span>
        <div>
          <span className="verify-kicker">{title}</span>
          <h3>{meta.label}</h3>
          <p>{meta.blurb}</p>
        </div>
        <div className="verify-ai-tags">
          <Badge tone={meta.tone} dot>
            {ai.verdict?.replaceAll('_', ' ') || 'AI pending'}
          </Badge>
          {ai.confidence && <Badge tone="muted">{ai.confidence.toLowerCase()} confidence</Badge>}
          {ai.provider && <Badge tone="muted">{ai.provider}</Badge>}
        </div>
      </header>

      {ai.recommendation && <p className="verify-recommendation">{ai.recommendation}</p>}

      {redFlags.length > 0 && (
        <div className="verify-redflags">
          <Icon name="flag" size={15} />
          <div>
            <strong>Red flags to check</strong>
            <ul>
              {redFlags.map((flag, index) => (
                <li key={`${flag}-${index}`}>{flag}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="verify-ai-grid">
        <div className="verify-ai-block">
          <h4>
            <Icon name="award" size={14} /> What the AI read
          </h4>
          {extracted.length === 0 ? (
            <p className="muted small">No fields could be extracted from the document.</p>
          ) : (
            <dl className="verify-extracted">
              {extracted.map(([key, value]) => (
                <div key={key}>
                  <dt>{EXTRACTED_LABELS[key] || key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="verify-ai-block">
          <h4>
            <Icon name="shield" size={14} /> Checks
          </h4>
          {checks.length === 0 ? (
            <p className="muted small">No individual checks were returned.</p>
          ) : (
            <ul className="verify-checks">
              {checks.map((check, index) => (
                <li key={`${check.label}-${index}`} className={check.passed ? 'passed' : 'failed'}>
                  <span className="verify-check-mark">
                    <Icon name={check.passed ? 'check' : 'x'} size={12} />
                  </span>
                  <div>
                    <strong>{check.label}</strong>
                    {check.note && <em>{check.note}</em>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {reasons.length > 0 && (
        <div className="verify-reasons">
          <h4>
            <Icon name="sparkles" size={14} /> Why the AI reached this verdict
          </h4>
          <ul>
            {reasons.map((reason, index) => (
              <li key={`${reason}-${index}`}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <footer className="verify-ai-foot">
        <Icon name="user" size={14} />
        <span>
          AI is advisory. An administrator reviews the documents and makes the final decision
          {ai.model ? ` · ${ai.model}` : ''}.
        </span>
      </footer>
    </section>
  )
}
