import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { Avatar, Badge, ErrorState, PageHeader, PageLoader, ProgressBar, Stat } from '../components/Ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { levelTone, relativeTime } from '../lib/format.js'

export default function Teach() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setError(null)
    api.get('/me/teaching').then(setData).catch(setError)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!data) return <PageLoader label="Opening your teaching studio…" />

  const { courses, stats, questions } = data
  const firstName = user.name.replace(/^Dr\.\s*/, '').split(' ')[0]

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${firstName}'s teaching studio`}
        title="Who is moving, and where are they stuck?"
        description="Your courses, roster progress and the questions that need you — without opening a spreadsheet."
        actions={
          <Link className="btn btn-primary" to="/app/teach/courses/new">
            <Icon name="plus" size={16} /> New course
          </Link>
        }
      />

      <div className="stats-row">
        <Stat label="Courses taught" value={stats.activeCourses} hint="published & draft" icon="book" />
        <Stat label="Students" value={stats.students} hint="across your studios" icon="users" tone="iris" />
        <Stat
          label="Questions waiting"
          value={stats.pendingQuestions}
          hint={stats.pendingQuestions ? 'unread in your threads' : 'inbox clear'}
          icon="message"
          tone={stats.pendingQuestions ? 'amber' : 'default'}
        />
        <Stat label="Unread messages" value={stats.unreadMessages} hint="student replies" icon="bell" />
      </div>

      <div className="teach-layout">
        <section>
          <div className="section-head compact">
            <div>
              <p className="eyebrow">Your studios</p>
              <h2>Courses you run</h2>
            </div>
            <Badge tone="lime" dot>
              {courses.length} open
            </Badge>
          </div>

          {courses.length === 0 ? (
            <div className="empty-panel">
              <Icon name="book" size={22} />
              <h3>No studio yet</h3>
              <p>Publish your first course and students from your field can enrol immediately.</p>
              <Link className="btn btn-primary btn-sm" to="/app/teach/courses/new">
                Create my first course
              </Link>
            </div>
          ) : (
            <div className="teach-course-grid">
              {courses.map((course) => (
                <article className="teach-course" key={course.id}>
                  <div className={`teach-course-mark cover-${course.cover}`}>
                    <Icon name={course.field?.icon || 'book'} size={22} />
                    <span>{course.code}</span>
                  </div>
                  <div className="teach-course-body">
                    <div className="teach-course-title">
                      <h3>{course.title}</h3>
                      <Badge tone={levelTone[course.level]}>{course.level}</Badge>
                    </div>
                    <p className="teach-course-meta">
                      {course.mode} · {course.durationWeeks} weeks · {course.credits} credits
                    </p>
                    <div className="teach-course-stats">
                      <span>
                        <strong>{course.studentCount}</strong> students
                      </span>
                      <span>
                        <strong>{course.completedCount}</strong> complete
                      </span>
                      <span>
                        <strong>{course.outcomeCount}</strong> outcomes
                      </span>
                    </div>
                    <div className="teach-progress">
                      <div>
                        <span>Average outcome progress</span>
                        <strong>{course.avgProgress}%</strong>
                      </div>
                      <ProgressBar value={course.avgProgress} tone={course.avgProgress > 60 ? 'cyan' : 'lime'} />
                    </div>
                    <div className="teach-course-actions">
                      <Link className="btn btn-soft btn-sm" to={`/app/teach/courses/${course.id}`}>
                        <Icon name="users" size={14} /> Roster
                      </Link>
                      <Link className="btn btn-ghost btn-sm" to={`/app/teach/courses/${course.id}?edit=1`}>
                        <Icon name="edit" size={14} /> Edit
                      </Link>
                      <Link className="btn btn-ghost btn-sm" to={`/app/courses/${course.id}`}>
                        View <Icon name="arrow-right" size={14} />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="teach-side">
          <div className="card">
            <div className="card-head-row">
              <h3>Questions in context</h3>
              <Link to="/app/messages" className="text-link">
                Inbox <Icon name="arrow-right" size={13} />
              </Link>
            </div>
            {questions.length === 0 && <p className="muted">No student questions yet. A rare and precious moment.</p>}
            <div className="question-list">
              {questions.map((thread) => {
                const person = thread.participants.find((item) => item.id !== user.id)
                return (
                  <Link to={`/app/messages?thread=${thread.id}`} className="question-row" key={thread.id}>
                    <Avatar person={person} size={32} />
                    <div>
                      <strong>{thread.subject}</strong>
                      <span>
                        {person?.name}
                        {thread.course ? ` · ${thread.course.code}` : ''}
                      </span>
                      <em>{relativeTime(thread.updatedAt)}</em>
                    </div>
                    {thread.unreadCount > 0 ? (
                      <span className="unread-pill">{thread.unreadCount}</span>
                    ) : (
                      <Icon name="chevron-right" size={15} />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="card teach-note">
            <span className="tone-lime">
              <Icon name="sparkles" size={18} />
            </span>
            <h3>Outcome-led, by design</h3>
            <p>
              Students can only mark an outcome achieved. When they do, it lands in your roster and
              in the campus pulse — the same signal, everywhere.
            </p>
            <Link className="text-link" to="/app/explore">
              See the student catalogue <Icon name="arrow-right" size={13} />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
