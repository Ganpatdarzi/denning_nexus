import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import {
  Avatar,
  Badge,
  ErrorState,
  Modal,
  PageHeader,
  PageLoader,
  Spinner,
  useToast,
} from '../components/Ui.jsx'
import { api } from '../lib/api.js'
import { cx, formatDate, roleLabel } from '../lib/format.js'

const STATUS_TONE = { active: 'lime', pending: 'amber', suspended: 'rose' }

export default function AdminUsers() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('all')
  const [status, setStatus] = useState(searchParams.get('status') || 'all')
  const [suspendTarget, setSuspendTarget] = useState(null)
  const [working, setWorking] = useState(null)

  const load = useCallback(() => {
    setError(null)
    setLoading(true)
    api
      .get('/admin/users')
      .then((data) => setUsers(data.users))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (status === 'all') next.delete('status')
    else next.set('status', status)
    setSearchParams(next, { replace: true })
    // Keep the URL shareable without re-fetching on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const changeStatus = async (person, nextStatus) => {
    setWorking(person.id)
    try {
      await api.patch(`/admin/users/${person.id}/status`, { status: nextStatus })
      toast(
        nextStatus === 'active'
          ? `${person.name} is now active${person.role === 'teacher' ? ' faculty' : ''}.`
          : `${person.name} has been ${nextStatus === 'suspended' ? 'suspended' : 'set to pending'}.`,
      )
      setSuspendTarget(null)
      load()
    } catch (requestError) {
      toast(requestError.message, 'error')
    } finally {
      setWorking(null)
    }
  }

  const counts = useMemo(
    () => ({
      all: users.length,
      student: users.filter((person) => person.role === 'student').length,
      teacher: users.filter((person) => person.role === 'teacher').length,
      admin: users.filter((person) => person.role === 'admin').length,
      pending: users.filter((person) => person.status === 'pending').length,
    }),
    [users],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return users.filter((person) => {
      if (role !== 'all' && person.role !== role) return false
      if (status !== 'all' && person.status !== status) return false
      if (!needle) return true
      return (
        person.name.toLowerCase().includes(needle) ||
        person.email.toLowerCase().includes(needle) ||
        (person.fieldName || '').toLowerCase().includes(needle)
      )
    })
  }, [users, role, status, query])

  if (loading && users.length === 0) return <PageLoader label="Opening the access panel…" />
  if (error) return <ErrorState error={error} onRetry={load} />

  return (
    <div className="page">
      <PageHeader
        eyebrow="People & access"
        title="Who is on campus, and what can they do?"
        description="Approve faculty, suspend an account or reactivate a student. Every change is written to the campus pulse."
        actions={
          <Link className="btn btn-ghost btn-sm" to="/app/admin">
            <Icon name="arrow-left" size={15} /> Campus pulse
          </Link>
        }
      />

      <div className="filter-bar">
        <div className="filter-row">
          <div className="field-pills">
            {[
              { key: 'all', label: 'Everyone' },
              { key: 'student', label: 'Students' },
              { key: 'teacher', label: 'Teachers' },
              { key: 'admin', label: 'Admins' },
            ].map((item) => (
              <button
                key={item.key}
                className={cx('pill', role === item.key && 'active')}
                onClick={() => setRole(item.key)}
                type="button"
              >
                {item.label} <span className="pill-count">{counts[item.key]}</span>
              </button>
            ))}
          </div>
          <form className="inline-search" onSubmit={(event) => event.preventDefault()}>
            <Icon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email or field…"
              aria-label="Search people"
            />
          </form>
        </div>
        <div className="filter-row secondary">
          <div className="select-group">
            <label>
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">Any status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
          </div>
          {counts.pending > 0 && (
            <Badge tone="amber" dot>
              {counts.pending} faculty application{counts.pending > 1 ? 's' : ''} waiting
            </Badge>
          )}
          <span className="muted small">{visible.length} shown</span>
        </div>
      </div>

      <div className="card access-card">
        <div className="table-wrap">
          <table className="table access-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Field</th>
                <th>Status</th>
                <th>Activity</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((person) => (
                <tr key={person.id}>
                  <td>
                    <div className="table-person">
                      <Avatar person={person} size={34} />
                      <div>
                        <strong>{person.name}</strong>
                        <span>{person.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="role-cell">
                      <Icon
                        name={person.role === 'admin' ? 'shield' : person.role === 'teacher' ? 'book' : 'cap'}
                        size={14}
                      />
                      {roleLabel[person.role]}
                    </span>
                  </td>
                  <td>
                    <span className="muted small">{person.fieldName || '—'}</span>
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[person.status]} dot>
                      {person.status}
                    </Badge>
                  </td>
                  <td>
                    <span className="muted small">
                      {person.role === 'teacher'
                        ? `${person.courseCount} courses`
                        : person.role === 'student'
                          ? `${person.enrollmentCount} courses`
                          : 'Platform lead'}
                    </span>
                  </td>
                  <td>
                    <span className="muted small">{formatDate(person.createdAt)}</span>
                  </td>
                  <td>
                    <div className="access-actions">
                      {person.role === 'admin' ? (
                        <span className="muted small">Protected</span>
                      ) : (
                        <>
                          {person.status === 'pending' && (
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={() => changeStatus(person, 'active')}
                              disabled={working === person.id}
                              type="button"
                            >
                              {working === person.id ? <Spinner size={11} /> : 'Approve'}
                            </button>
                          )}
                          {person.status === 'suspended' && (
                            <button
                              className="btn btn-soft btn-xs"
                              onClick={() => changeStatus(person, 'active')}
                              disabled={working === person.id}
                              type="button"
                            >
                              Reactivate
                            </button>
                          )}
                          {person.status === 'active' && (
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => setSuspendTarget(person)}
                              disabled={working === person.id}
                              type="button"
                            >
                              Suspend
                            </button>
                          )}
                          {person.status === 'pending' && (
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => setSuspendTarget(person)}
                              type="button"
                            >
                              Decline
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && (
          <p className="muted center pad">No people match these filters.</p>
        )}
      </div>

      <Modal
        open={Boolean(suspendTarget)}
        onClose={() => setSuspendTarget(null)}
        title={`Suspend ${suspendTarget?.name}?`}
        description="They will lose access immediately. Conversations and outcomes stay intact."
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setSuspendTarget(null)} type="button">
              Cancel
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => changeStatus(suspendTarget, 'suspended')}
              disabled={working === suspendTarget?.id}
              type="button"
            >
              {working === suspendTarget?.id ? <Spinner size={13} /> : null} Suspend account
            </button>
          </>
        }
      >
        <p className="muted">
          This action is best for policy breaches or safeguarding. To decline a pending faculty
          application, the same control applies — they can reapply later.
        </p>
      </Modal>
    </div>
  )
}
