import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import {
  Badge,
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
  useToast,
} from '../components/Ui.jsx'
import { api } from '../lib/api.js'
import { cx, relativeTime } from '../lib/format.js'

const ICONS = {
  message: 'message',
  enrollment: 'cap',
  outcome: 'target',
  approval: 'shield',
  course: 'book',
  broadcast: 'sparkles',
  system: 'bell',
  digest: 'chart',
  assignment: 'cap',
  submission: 'book',
  audit: 'sparkles',
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const { toast } = useToast()
  const navigate = useNavigate()

  const load = useCallback(() => {
    setError(null)
    api
      .get('/notifications?limit=100')
      .then((data) => {
        setNotifications(data.notifications)
        setUnread(data.unread)
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all')
      setNotifications((current) => current.map((item) => ({ ...item, read: true })))
      setUnread(0)
      window.dispatchEvent(new Event('nexus:signals'))
      toast('All signals marked as read.')
    } catch (requestError) {
      toast(requestError.message, 'error')
    }
  }

  const open = async (notification) => {
    if (!notification.read) {
      try {
        await api.patch(`/notifications/${notification.id}/read`)
        setNotifications((current) =>
          current.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
        )
        setUnread((current) => Math.max(0, current - 1))
        window.dispatchEvent(new Event('nexus:signals'))
      } catch {
        // Navigation should still work if the read receipt fails.
      }
    }
    if (notification.link) navigate(notification.link)
  }

  const visible =
    filter === 'unread' ? notifications.filter((item) => !item.read) : notifications

  if (loading) return <PageLoader label="Tuning the campus signals…" />
  if (error) return <ErrorState error={error} onRetry={load} />

  return (
    <div className="page">
      <PageHeader
        eyebrow="Signals"
        title="Everything the campus wants you to know."
        description="Messages, enrolments, outcome milestones, faculty approvals and broadcasts — in one chronological pulse."
        actions={
          <>
            <Badge tone={unread ? 'amber' : 'muted'} dot>
              {unread} unread
            </Badge>
            <button className="btn btn-ghost btn-sm" onClick={markAll} disabled={!unread} type="button">
              <Icon name="check" size={15} /> Mark all read
            </button>
          </>
        }
      />

      <div className="segmented">
        <button className={cx(filter === 'all' && 'active')} onClick={() => setFilter('all')} type="button">
          All signals <span>{notifications.length}</span>
        </button>
        <button className={cx(filter === 'unread' && 'active')} onClick={() => setFilter('unread')} type="button">
          Unread <span>{unread}</span>
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="bell"
          title={filter === 'unread' ? 'All clear' : 'No signals yet'}
          description={
            filter === 'unread'
              ? 'You have read everything on the campus. New activity will land here.'
              : 'Enrol in a course or send a message and the campus will start talking back.'
          }
        />
      ) : (
        <div className="notification-list">
          {visible.map((notification) => (
            <button
              key={notification.id}
              className={cx('notification-row', !notification.read && 'unread')}
              onClick={() => open(notification)}
              type="button"
            >
              <span className={cx('bell-icon', `tone-${notification.type}`)}>
                <Icon name={ICONS[notification.type] || 'bell'} size={17} />
              </span>
              <span className="notification-copy">
                <span className="notification-top">
                  <strong>{notification.title}</strong>
                  <em>{relativeTime(notification.createdAt)}</em>
                </span>
                <span>{notification.body}</span>
                <span className="notification-type">{notification.type}</span>
              </span>
              {!notification.read && <span className="unread-dot" />}
              <Icon name="chevron-right" size={16} className="notification-arrow" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
