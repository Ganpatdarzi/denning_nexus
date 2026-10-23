import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import {
  Avatar,
  Badge,
  ErrorState,
  Modal,
  PageHeader,
  PageLoader,
  ProgressBar,
  Stat,
  Spinner,
  useToast,
} from '../components/Ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { cx, relativeTime, roleLabel } from '../lib/format.js'

const ACTIVITY_ICONS = {
  message: 'message',
  enrollment: 'cap',
  outcome: 'target',
  user: 'user',
  course: 'book',
  thread: 'message',
  broadcast: 'sparkles',
  assignment: 'cap',
  submission: 'book',
  audit: 'sparkles',
}

export default function Admin() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [activityRole, setActivityRole] = useState('all')
  const [error, setError] = useState(null)
  const [approving, setApproving] = useState(null)
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [broadcast, setBroadcast] = useState({ title: '', body: '', audience: 'all' })
  const [sending, setSending] = useState(false)

  const load = useCallback(() => {
    setError(null)
    Promise.all([api.get('/admin/stats'), api.get(`/admin/activity?limit=20`)])
      .then(([statsData, activityData]) => {
        setStats(statsData)
        setActivity(activityData.activity)
      })
      .catch(setError)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!stats) return
    api
      .get(`/admin/activity?limit=20&role=${activityRole}`)
      .then((data) => setActivity(data.activity))
      .catch(() => {})
  }, [activityRole, stats])

  const approve = async (teacher) => {
    setApproving(teacher.id)
    try {
      await api.patch(`/admin/users/${teacher.id}/status`, { status: 'active' })
      toast(`${teacher.name} now has faculty access.`)
      load()
    } catch (requestError) {
      toast(requestError.message, 'error')
    } finally {
      setApproving(null)
    }
  }

  const sendBroadcast = async (event) => {
    event.preventDefault()
    setSending(true)
    try {
      const data = await api.post('/admin/broadcast', broadcast)
      toast(`Broadcast delivered to ${data.delivered} people.`)
      setBroadcastOpen(false)
      setBroadcast({ title: '', body: '', audience: 'all' })
      load()
    } catch (requestError) {
      toast(requestError.message, 'error')
    } finally {
      setSending(false)
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!stats) return <PageLoader label="Reading the campus pulse…" />

  const maxField = Math.max(...stats.byField.map((field) => field.enrollments), 1)
  const firstName = user.name.split(' ')[0]

  return (
    <div className="page">
      <PageHeader
        eyebrow={`Campus operations · ${firstName}`}
        title="The whole campus, in one pulse."
        description="Approvals, conversations, enrolment balance and outcome health — the signals that need a human decision."
        actions={
          <>
            <button className="btn btn-primary btn-sm" onClick={() => setBroadcastOpen(true)} type="button">
              <Icon name="send" size={15} /> Broadcast
            </button>
            <Link className="btn btn-soft btn-sm" to="/app/admin/verifications">
              <Icon name="award" size={15} /> Teacher verification
            </Link>
            <Link className="btn btn-ghost btn-sm" to="/app/admin/users">
              <Icon name="shield" size={15} /> People & access
            </Link>
          </>
        }
      />

      <div className="stats-row">
        <Stat
          label="People"
          value={stats.users.total}
          hint={`${stats.users.students} students · ${stats.users.teachers} teachers`}
          icon="users"
        />
        <Stat
          label="Courses"
          value={stats.courses.published}
          hint={`${stats.courses.enrollments} enrolments · ${stats.courses.seatsLeft} seats left`}
          icon="book"
          tone="iris"
        />
        <Stat
          label="Conversations"
          value={stats.conversations.messages}
          hint={`${stats.conversations.messagesLast7Days} messages in 7 days`}
          icon="message"
          tone="cyan"
        />
        <Stat
          label="Avg completion"
          value={`${stats.outcomes.avgCompletion}%`}
          hint={`${stats.outcomes.achieved} of ${stats.outcomes.tracked} outcomes`}
          icon="target"
          tone={stats.outcomes.avgCompletion >= 50 ? 'lime' : 'amber'}
        />
      </div>

      <div className="admin-grid">
        <section className="card pulse-card">
          <div className="card-head-row">
            <div>
              <h3>Live campus pulse</h3>
              <p className="muted small">Every enrolment, question, outcome and approval — as it happens.</p>
            </div>
            <div className="segmented small">
              {['all', 'student', 'teacher'].map((role) => (
                <button
                  key={role}
                  className={cx(activityRole === role && 'active')}
                  onClick={() => setActivityRole(role)}
                  type="button"
                >
                  {role === 'all' ? 'Everyone' : role === 'student' ? 'Students' : 'Teachers'}
                </button>
              ))}
            </div>
          </div>

          <div className="pulse-list">
            {activity.map((item) => (
              <div className="pulse-row" key={item.id}>
                <span className={cx('pulse-actor', `role-${item.actorRole}`)}>
                  {item.actorRole === 'system' ? (
                    <Icon name="sparkles" size={15} />
                  ) : (
                    (item.actorName || '?')
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                  )}
                </span>
                <div className="pulse-copy">
                  <p>
                    <strong>{item.actorName}</strong> {item.summary}
                  </p>
                  <span>
                    {relativeTime(item.createdAt)} · {roleLabel[item.actorRole] || 'System'}
                  </span>
                </div>
                <span className={cx('pulse-type', `tone-${item.type}`)}>
                  <Icon name={ACTIVITY_ICONS[item.type] || 'sparkles'} size={14} />
                </span>
              </div>
            ))}
            {activity.length === 0 && <p className="muted">No activity for this filter yet.</p>}
          </div>
        </section>

        <aside className="admin-side">
          <div className="card approval-card">
            <div className="card-head-row">
              <h3>Waiting on you</h3>
              <Badge tone={stats.pendingTeachers.length ? 'amber' : 'muted'} dot>
                {stats.pendingTeachers.length} pending
              </Badge>
            </div>
            {stats.pendingTeachers.length === 0 ? (
              <p className="muted small">No faculty applications waiting. Access is up to date.</p>
            ) : (
              stats.pendingTeachers.map((teacher) => (
                <div className="approval-row" key={teacher.id}>
                  <Avatar person={teacher} size={38} />
                  <div>
                    <strong>{teacher.name}</strong>
                    <span>{teacher.field}</span>
                    <em>Applied {relativeTime(teacher.appliedAt)}</em>
                  </div>
                  <button
                    className="btn btn-primary btn-xs"
                    onClick={() => approve(teacher)}
                    disabled={approving === teacher.id}
                    type="button"
                  >
                    {approving === teacher.id ? <Spinner size={12} /> : 'Approve'}
                  </button>
                </div>
              ))
            )}
            <Link className="text-link" to="/app/admin/verifications">
              Review documents & AI verdicts <Icon name="arrow-right" size={13} />
            </Link>
            <Link className="text-link" to="/app/admin/users?status=pending">
              Open access panel <Icon name="arrow-right" size={13} />
            </Link>
          </div>

          <div className="card">
            <div className="card-head-row">
              <h3>Field balance</h3>
              <span className="muted small">Enrolments</span>
            </div>
            <div className="field-balance">
              {stats.byField.map((field) => (
                <div className="balance-row" key={field.slug}>
                  <span className={cx('balance-icon', `tone-${field.accent}`)}>
                    <Icon name={field.icon} size={14} />
                  </span>
                  <div>
                    <span>{field.name}</span>
                    <ProgressBar
                      value={(field.enrollments / maxField) * 100}
                      tone={field.enrollments >= maxField ? 'cyan' : 'lime'}
                    />
                  </div>
                  <strong>{field.enrollments}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head-row">
              <h3>Top courses</h3>
              <Link to="/app/explore" className="text-link">
                Catalogue <Icon name="arrow-right" size={13} />
              </Link>
            </div>
            <div className="top-course-list">
              {stats.topCourses.map((course, index) => (
                <Link to={`/app/courses/${course.id}`} className="top-course" key={course.id}>
                  <span className="top-rank">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{course.title}</strong>
                    <em>
                      {course.code} · {course.teacher?.name}
                    </em>
                  </div>
                  <span className="top-count">{course.enrolledCount}</span>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <section className="card watch-card">
        <div className="card-head-row">
          <div>
            <h3>Conversation watch</h3>
            <p className="muted small">The latest student–teacher threads. Open any thread to read the full context.</p>
          </div>
          <Link className="btn btn-ghost btn-sm" to="/app/messages">
            All conversations <Icon name="arrow-right" size={14} />
          </Link>
        </div>
        <div className="watch-grid">
          {stats.recentThreads.map((thread) => (
            <Link className="watch-row" to={`/app/messages?thread=${thread.id}`} key={thread.id}>
              <span className="watch-avatars">
                {thread.participants.map((person) => (
                  <Avatar key={person.id} person={person} size={28} />
                ))}
              </span>
              <div>
                <strong>{thread.subject}</strong>
                <span>
                  {thread.participants.map((person) => person.name).join(' ↔ ')}
                </span>
                <em>
                  {thread.course ? `${thread.course.code} · ` : ''}
                  {relativeTime(thread.updatedAt)}
                </em>
              </div>
              {thread.unreadCount > 0 ? (
                <Badge tone="amber">{thread.unreadCount} new</Badge>
              ) : (
                <Icon name="chevron-right" size={15} />
              )}
            </Link>
          ))}
        </div>
      </section>

      <Modal
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        title="Send a campus broadcast"
        description="One message, delivered as a notification to the audience you choose."
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setBroadcastOpen(false)} type="button">
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={sendBroadcast}
              disabled={sending || !broadcast.title.trim() || !broadcast.body.trim()}
              type="button"
            >
              {sending ? <Spinner size={14} /> : <Icon name="send" size={14} />} Send broadcast
            </button>
          </>
        }
      >
        <form className="compose-form" onSubmit={sendBroadcast}>
          <label className="field">
            <span>Audience</span>
            <select
              value={broadcast.audience}
              onChange={(event) => setBroadcast((current) => ({ ...current, audience: event.target.value }))}
            >
              <option value="all">Everyone on campus</option>
              <option value="students">Students only</option>
              <option value="teachers">Teachers only</option>
            </select>
          </label>
          <label className="field">
            <span>Title</span>
            <input
              value={broadcast.title}
              onChange={(event) => setBroadcast((current) => ({ ...current, title: event.target.value }))}
              placeholder="Enrolment opens for next term"
              maxLength={120}
              required
            />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea
              rows={5}
              value={broadcast.body}
              onChange={(event) => setBroadcast((current) => ({ ...current, body: event.target.value }))}
              placeholder="Keep it short, specific and useful."
              maxLength={600}
              required
            />
          </label>
          <div className="broadcast-summary">
            <Icon name="bell" size={15} />
            <span>
              This reaches{' '}
              <strong>
                {broadcast.audience === 'all'
                  ? stats.users.active
                  : broadcast.audience === 'students'
                    ? stats.users.students
                    : stats.users.teachers}
              </strong>{' '}
              active accounts.
            </span>
          </div>
        </form>
      </Modal>
    </div>
  )
}
