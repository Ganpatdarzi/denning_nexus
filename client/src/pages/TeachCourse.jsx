import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import {
  Avatar,
  Badge,
  ErrorState,
  PageLoader,
  ProgressBar,
  Stat,
  useToast,
} from '../components/Ui.jsx'
import { api } from '../lib/api.js'
import { cx, levelTone, relativeTime } from '../lib/format.js'

export default function TeachCourse() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [rosterSearch, setRosterSearch] = useState('')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const editOpen = searchParams.get('edit') === '1'

  const load = useCallback(async () => {
    setError(null)
    try {
      const [courseData, rosterData] = await Promise.all([
        api.get(`/courses/${id}`),
        api.get(`/courses/${id}/roster`),
      ])
      setData({ ...courseData, roster: rosterData.roster })
      setForm({
        title: courseData.course.title,
        code: courseData.course.code,
        description: courseData.course.description,
        level: courseData.course.level,
        mode: courseData.course.mode,
        credits: courseData.course.credits,
        durationWeeks: courseData.course.durationWeeks,
        seats: courseData.course.seats,
        tags: courseData.course.tags.join(', '),
        outcomes: courseData.course.outcomes.map((outcome) => outcome.text).join('\n'),
        published: courseData.course.published,
      })
    } catch (requestError) {
      setError(requestError)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const roster = data?.roster || []
  const course = data?.course

  const filteredRoster = useMemo(() => {
    if (!rosterSearch.trim()) return roster
    const needle = rosterSearch.toLowerCase()
    return roster.filter(
      (row) =>
        row.student?.name.toLowerCase().includes(needle) ||
        row.student?.email.toLowerCase().includes(needle),
    )
  }, [roster, rosterSearch])

  const health = useMemo(() => {
    const buckets = [
      { label: 'Not started', count: roster.filter((row) => row.progress.percent === 0).length },
      { label: '1–49%', count: roster.filter((row) => row.progress.percent > 0 && row.progress.percent < 50).length },
      { label: '50–99%', count: roster.filter((row) => row.progress.percent >= 50 && row.progress.percent < 100).length },
      { label: 'Complete', count: roster.filter((row) => row.progress.percent === 100).length },
    ]
    return buckets
  }, [roster])

  const toggleEdit = () => {
    const next = new URLSearchParams(searchParams)
    if (editOpen) next.delete('edit')
    else next.set('edit', '1')
    setSearchParams(next, { replace: true })
    setSaved(false)
  }

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const outcomes = form.outcomes
        .split('\n')
        .map((line) => line.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean)
      await api.patch(`/courses/${course.id}`, {
        title: form.title,
        code: form.code,
        description: form.description,
        level: form.level,
        mode: form.mode,
        credits: Number(form.credits),
        durationWeeks: Number(form.durationWeeks),
        seats: Number(form.seats),
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        outcomes,
        published: form.published,
      })
      toast('Course updated. Students see the changes immediately.')
      setSaved(true)
      await load()
    } catch (requestError) {
      toast(requestError.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!data || !form) return <PageLoader label="Opening the studio roster…" />

  const avgProgress = roster.length
    ? Math.round(roster.reduce((sum, row) => sum + row.progress.percent, 0) / roster.length)
    : 0
  const completed = roster.filter((row) => row.status === 'completed').length

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/app/teach">
          <Icon name="arrow-left" size={14} /> Teaching studio
        </Link>
        <span>/</span>
        <em>{course.code}</em>
      </div>

      <header className="studio-head">
        <div className={`studio-mark cover-${course.cover}`}>
          <Icon name={course.field?.icon || 'book'} size={26} />
          <span>{course.code}</span>
        </div>
        <div className="studio-title">
          <div className="studio-badges">
            <Badge tone={levelTone[course.level]}>{course.level}</Badge>
            <Badge tone={course.published ? 'lime' : 'rose'} dot>
              {course.published ? 'Published' : 'Draft'}
            </Badge>
            <span className="muted small">
              {course.mode} · {course.durationWeeks} weeks · {course.credits} credits
            </span>
          </div>
          <h1>{course.title}</h1>
          <p>{course.description}</p>
        </div>
        <div className="studio-actions">
          <button className="btn btn-soft btn-sm" onClick={toggleEdit} type="button">
            <Icon name="edit" size={15} /> {editOpen ? 'Close editor' : 'Edit course'}
          </button>
          <Link className="btn btn-ghost btn-sm" to={`/app/courses/${course.id}`}>
            Student view <Icon name="arrow-right" size={15} />
          </Link>
        </div>
      </header>

      <div className="stats-row">
        <Stat label="Enrolled" value={roster.length} hint={`${course.seats - roster.length} seats left`} icon="users" />
        <Stat label="Average progress" value={`${avgProgress}%`} hint="across all outcomes" icon="target" tone="lime" />
        <Stat label="Completed" value={completed} hint="finished every outcome" icon="award" tone="cyan" />
        <Stat label="Outcomes" value={course.outcomeCount} hint="tracked per student" icon="book" />
      </div>

      {editOpen && (
        <form className="card studio-editor" onSubmit={save}>
          <div className="section-head compact">
            <div>
              <p className="eyebrow">Editor</p>
              <h2>Change what the studio promises</h2>
            </div>
            <Badge tone={saved ? 'lime' : 'muted'}>{saved ? 'Saved' : 'Unsaved changes stay local'}</Badge>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Title</span>
              <input value={form.title} onChange={(event) => set('title', event.target.value)} required />
            </label>
            <label className="field">
              <span>Code</span>
              <input value={form.code} onChange={(event) => set('code', event.target.value.toUpperCase())} />
            </label>
          </div>

          <label className="field">
            <span>Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
              required
            />
          </label>

          <div className="form-grid four">
            <label className="field">
              <span>Level</span>
              <select value={form.level} onChange={(event) => set('level', event.target.value)}>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </label>
            <label className="field">
              <span>Mode</span>
              <select value={form.mode} onChange={(event) => set('mode', event.target.value)}>
                <option>Hybrid</option>
                <option>Online</option>
                <option>On campus</option>
              </select>
            </label>
            <label className="field">
              <span>Seats</span>
              <input type="number" min="1" value={form.seats} onChange={(event) => set('seats', event.target.value)} />
            </label>
            <label className="field">
              <span>Credits</span>
              <input type="number" min="1" value={form.credits} onChange={(event) => set('credits', event.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>Learning outcomes (one per line)</span>
            <textarea rows={6} value={form.outcomes} onChange={(event) => set('outcomes', event.target.value)} />
            <em className="field-hint">
              Editing outcomes keeps existing progress for outcomes that still exist. Removed outcomes are archived.
            </em>
          </label>

          <label className="field">
            <span>Tags</span>
            <input value={form.tags} onChange={(event) => set('tags', event.target.value)} />
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(event) => set('published', event.target.checked)}
            />
            <span>
              <strong>Published</strong>
              <em>Visible in the student catalogue and open for enrolment.</em>
            </span>
          </label>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={saving} type="submit">
              {saving ? <Icon name="clock" size={15} /> : <Icon name="check" size={15} />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <span className="muted small">Students in this course will see the update on their next visit.</span>
          </div>
        </form>
      )}

      <div className="studio-grid">
        <section className="card roster-card">
          <div className="section-head compact">
            <div>
              <p className="eyebrow">Roster</p>
              <h2>How each student is moving</h2>
            </div>
            <div className="inline-search small-search">
              <Icon name="search" size={14} />
              <input
                value={rosterSearch}
                onChange={(event) => setRosterSearch(event.target.value)}
                placeholder="Find a student…"
                aria-label="Search roster"
              />
            </div>
          </div>

          {roster.length === 0 ? (
            <p className="muted">No students have enrolled yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table roster-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Outcomes</th>
                    <th>Progress</th>
                    <th>Last active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.map((row) => (
                    <tr key={row.enrollmentId}>
                      <td>
                        <div className="table-person">
                          <Avatar person={row.student} size={32} />
                          <div>
                            <strong>{row.student?.name}</strong>
                            <span>{row.student?.year} · {row.student?.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="outcome-count">
                          {row.progress.done}/{row.progress.total}
                        </span>
                      </td>
                      <td>
                        <div className="table-progress">
                          <ProgressBar
                            value={row.progress.percent}
                            tone={row.progress.percent === 100 ? 'cyan' : 'lime'}
                          />
                          <strong>{row.progress.percent}%</strong>
                        </div>
                      </td>
                      <td>
                        <span className="muted small">{relativeTime(row.lastActivityAt)}</span>
                      </td>
                      <td>
                        <Link
                          className="icon-btn"
                          to={`/app/messages?compose=${row.student?.id}&course=${course.id}`}
                          title={`Message ${row.student?.name}`}
                        >
                          <Icon name="message" size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRoster.length === 0 && <p className="muted small">No student matches that search.</p>}
            </div>
          )}
        </section>

        <aside className="studio-side">
          <div className="card">
            <div className="card-head-row">
              <h3>Course health</h3>
              <Badge tone="cyan">{avgProgress}% avg</Badge>
            </div>
            <div className="health-list">
              {health.map((bucket) => (
                <div className="health-row" key={bucket.label}>
                  <span>{bucket.label}</span>
                  <div className="health-bar">
                    <span style={{ width: `${roster.length ? (bucket.count / roster.length) * 100 : 0}%` }} />
                  </div>
                  <strong>{bucket.count}</strong>
                </div>
              ))}
            </div>
            <p className="muted small">
              Nudge the students in the left column before the midpoint of the course.
            </p>
          </div>

          <div className="card">
            <div className="card-head-row">
              <h3>Outcomes</h3>
              <span className="muted small">{course.outcomeCount}</span>
            </div>
            <ul className="mini-outcomes">
              {course.outcomes.map((outcome) => (
                <li key={outcome.id}>
                  <Icon name="target" size={13} />
                  {outcome.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="card teach-note">
            <span className="tone-amber">
              <Icon name="message" size={18} />
            </span>
            <h3>Keep the door open</h3>
            <p>Students who message a teacher in week one are far more likely to finish the outcomes.</p>
            <Link className="text-link" to="/app/messages">
              Open your inbox <Icon name="arrow-right" size={13} />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
