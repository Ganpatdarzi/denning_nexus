import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import { cx, initials } from '../lib/format.js'

/* --------------------------------- avatar --------------------------------- */

export function Avatar({ person, size = 40, className = '' }) {
  const accent = person?.accent || 'iris'
  return (
    <span
      className={cx('avatar', `avatar-${accent}`, className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.32) }}
      title={person?.name}
    >
      {person?.avatar || initials(person?.name || '?')}
    </span>
  )
}

/* ---------------------------------- badge --------------------------------- */

export function Badge({ children, tone = 'muted', dot = false, className = '' }) {
  return (
    <span className={cx('badge', `badge-${tone}`, className)}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  )
}

/* ---------------------------------- ring ---------------------------------- */

export function ProgressRing({ value = 0, size = 92, stroke = 8, label, sublabel }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  const offset = circumference - (clamped / 100) * circumference
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-label">
        <strong>{label ?? `${clamped}%`}</strong>
        {sublabel && <span>{sublabel}</span>}
      </div>
    </div>
  )
}

export function ProgressBar({ value = 0, tone = 'lime', className = '' }) {
  return (
    <div className={cx('progress', `progress-${tone}`, className)}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

/* -------------------------------- feedback -------------------------------- */

export function Spinner({ size = 18, className = '' }) {
  return <span className={cx('spinner', className)} style={{ width: size, height: size }} />
}

export function PageLoader({ label = 'Opening your campus…' }) {
  return (
    <div className="page-loader">
      <div className="loader-orbit">
        <span />
        <span />
        <span />
      </div>
      <p>{label}</p>
    </div>
  )
}

export function EmptyState({ icon = 'sparkles', title, description, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty-state error">
      <span className="empty-icon">
        <Icon name="flag" size={22} />
      </span>
      <h3>That did not load</h3>
      <p>{error?.message || 'Please try again in a moment.'}</p>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry} type="button">
          Try again
        </button>
      )}
    </div>
  )
}

/* -------------------------------- page head -------------------------------- */

export function PageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-desc">{description}</p>}
        {children}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function Stat({ label, value, hint, tone = 'default', icon }) {
  return (
    <div className={cx('stat', `stat-${tone}`)}>
      <div className="stat-top">
        <span>{label}</span>
        {icon && (
          <span className="stat-icon">
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <strong>{value}</strong>
      {hint && <p>{hint}</p>}
    </div>
  )
}

/* ---------------------------------- modal --------------------------------- */

export function Modal({ open, onClose, title, description, children, footer, wide = false, className = '' }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={cx('modal', wide && 'modal-wide', className)} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close" type="button">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------------------------------- toast --------------------------------- */

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const toast = useCallback(
    (message, tone = 'success') => {
      const id = Math.random().toString(36).slice(2)
      setToasts((current) => [...current, { id, message, tone }])
      window.setTimeout(() => remove(id), 4200)
    },
    [remove],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={cx('toast', `toast-${item.tone}`)}>
            <span className="toast-mark">
              <Icon name={item.tone === 'error' ? 'flag' : 'check'} size={14} />
            </span>
            <p>{item.message}</p>
            <button onClick={() => remove(item.id)} aria-label="Dismiss" type="button">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
