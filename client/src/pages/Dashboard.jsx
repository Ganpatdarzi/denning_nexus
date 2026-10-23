import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import CourseCard from '../components/CourseCard.jsx'
import { Avatar, Badge, ErrorState, PageHeader, PageLoader, ProgressBar, ProgressRing, Stat } from '../components/Ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { relativeTime } from '../lib/format.js'

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setError(null)
    api
      .get('/me/dashboard')
      .then(setData)
      .catch(setError)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!data) return <PageLoader label="Mapping your learning orbit…" />

  const { stats, courses, recommendations, teachers, notifications } = data
  const firstName = user.name.replace(/^Dr\.\s*/, '').split(' ')[0]
  const topCourse = courses[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const unreadNotifications = notifications.filter((item) => !item.read)

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${greeting}, ${firstName}`}
        title="Your learning orbit"
        description={`${user.fieldSlug ? user.fieldSlug.replace(/^\w/, (letter) => letter.toUpperCase()) : 'Open field'} · ${user.year || 'Student'} · every outcome you finish moves the map.`}
        actions={
          <Link className="btn btn-primary" to="/app/explore">
            <Icon name="compass" size={16} /> Explore courses
          </Link>
        }
      />

      <div className="dash-top">
        <section className="orbit-card">
          <div className="orbit-card-main">
            <ProgressRing value={stats.avgProgress} size={132} stroke={11} sublabel="average" />
            <div>
              <p className="eyebrow">Across {courses.length} courses</p>
              <h2>{stats.outcomesDone} of {stats.outcomesTotal} outcomes achieved</h2>
              <p>
                {topCourse
                  ? `You are ${topCourse.progress.percent}% through ${topCourse.code}. Pick up “${topCourse.outcomes?.[0]?.text || topCourse.title}” next.`
                  : 'Enrol in a course to start your first outcome.'}
              </p>
              <div className="orbit-mini-stats">
                <span>
                  <strong>{stats.activeCourses}</strong> active
                </span>
                <span>
                  <strong>{stats.outcomesTotal - stats.outcomesDone}</strong> to go
                </span>
                <span>
                  <strong>{stats.completedCourses}</strong> completed
                </span>
              </div>
            </div>
          </div>
          {courses.length > 0 && (
            <div className="orbit-continue">
              <span>Continue where you left off</span>
              <div className="orbit-continue-list">
                {courses.slice(0, 3).map((course) => (
                  <Link to={`/app/courses/${course.id}`} key={course.id} className="orbit-continue-item">
                    <span className={`continue-dot cover-${course.cover}`} />
                    <div>
                      <strong>{course.code}</strong>
                      <em>{course.title}</em>
                    </div>
                    <ProgressBar value={course.progress.percent} />
                    <span className="continue-pct">{course.progress.percent}%</span>
                    <Icon name="chevron-right" size={15} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="dash-side">
          <div className="card signal-card">
            <div className="card-head-row">
              <h3>Signals</h3>
              <Link to="/app/notifications" className="text-link">
                All <Icon name="arrow-right" size={13} />
              </Link>
            </div>
            <div className="signal-list">
              {notifications.length === 0 && <p className="muted">No new signals. Enjoy the quiet.</p>}
              {notifications.map((item) => (
                <Link key={item.id} className="signal-row" to={item.link || '/app/notifications'}>
                  <span className={`signal-mark ${item.read ? '' : 'live'}`} />
                  <div>
                    <strong>{item.title}</strong>
                    <em>{relativeTime(item.createdAt)}</em>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="card teacher-quick">
            <div className="card-head-row">
              <h3>Your teachers</h3>
              <Link to="/app/teachers" className="text-link">
                All <Icon name="arrow-right" size={13} />
              </Link>
            </div>
            {teachers.length === 0 && <p className="muted">Your teachers appear once you enrol.</p>}
            {teachers.map((teacher) => (
              <Link className="teacher-quick-row" to={`/app/messages?compose=${teacher.id}`} key={teacher.id}>
                <Avatar person={teacher} size={34} />
                <div>
                  <strong>{teacher.name}</strong>
                  <em>{teacher.officeHours}</em>
                </div>
                <Icon name="message" size={16} />
              </Link>
            ))}
          </div>
        </aside>
      </div>

      <div className="stats-row">
        <Stat label="Active courses" value={stats.activeCourses} hint="this term" icon="book" />
        <Stat label="Outcomes achieved" value={`${stats.outcomesDone}/${stats.outcomesTotal}`} hint="tracked progress" icon="target" tone="lime" />
        <Stat label="Unread messages" value={stats.unreadMessages} hint={stats.unreadMessages ? 'teachers are waiting' : 'all caught up'} icon="message" tone={stats.unreadMessages ? 'amber' : 'default'} />
        <Stat label="Unread signals" value={unreadNotifications.length} hint="notifications" icon="bell" />
      </div>

      <section className="page-section">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">In progress</p>
            <h2>Your courses</h2>
          </div>
          <Link to="/app/explore" className="text-link">
            Add a course <Icon name="plus" size={14} />
          </Link>
        </div>
        {courses.length === 0 ? (
          <div className="empty-panel">
            <Icon name="compass" size={22} />
            <h3>Your orbit is empty</h3>
            <p>Pick a course from your field and your first outcome will appear here.</p>
            <Link className="btn btn-primary btn-sm" to="/app/explore">
              Explore the catalogue
            </Link>
          </div>
        ) : (
          <div className="course-grid">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                progress={course.progress}
                actions={
                  <Link className="btn btn-ghost btn-sm btn-block" to={`/app/courses/${course.id}`}>
                    Continue learning <Icon name="arrow-right" size={14} />
                  </Link>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="page-section">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Chosen for your field</p>
            <h2>Next openings</h2>
          </div>
          <Badge tone="iris">{user.interests?.length ? user.interests.slice(0, 2).join(' · ') : 'Field picks'}</Badge>
        </div>
        <div className="course-grid">
          {recommendations.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      </section>
    </div>
  )
}
