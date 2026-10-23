import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { Avatar, Badge, ProgressBar } from './Ui.jsx'
import { levelTone } from '../lib/format.js'

export default function CourseCard({ course, progress, actions }) {
  return (
    <article className="course-card">
      <Link to={`/app/courses/${course.id}`} className={`course-cover cover-${course.cover}`}>
        <span className="cover-noise" />
        <span className="course-code">{course.code}</span>
        <Icon name={course.field?.icon || 'book'} size={54} className="course-cover-icon" />
        <span className="course-level">
          <Badge tone={levelTone[course.level] || 'muted'}>{course.level}</Badge>
        </span>
      </Link>
      <div className="course-body">
        <p className="course-kicker">
          {course.field?.name || 'Open field'} <span>·</span> {course.mode}
        </p>
        <h3>
          <Link to={`/app/courses/${course.id}`}>{course.title}</Link>
        </h3>
        <p className="course-desc">{course.description}</p>

        <div className="course-teacher">
          <Avatar person={course.teacher} size={26} />
          <span>{course.teacher?.name}</span>
          <span className="course-rating">
            <Icon name="star" size={13} /> {course.rating ? course.rating.toFixed(1) : 'New'}
          </span>
        </div>

        {progress && (
          <div className="course-progress">
            <div className="course-progress-top">
              <span>
                {progress.done} of {progress.total} outcomes
              </span>
              <strong>{progress.percent}%</strong>
            </div>
            <ProgressBar value={progress.percent} tone={progress.percent === 100 ? 'cyan' : 'lime'} />
          </div>
        )}

        <div className="course-meta">
          <span>
            <Icon name="clock" size={14} /> {course.durationWeeks} weeks
          </span>
          <span>
            <Icon name="cap" size={14} /> {course.credits} credits
          </span>
          <span>
            <Icon name="users" size={14} /> {course.enrolledCount}/{course.seats}
          </span>
        </div>

        {actions && <div className="course-actions">{actions}</div>}
      </div>
    </article>
  )
}
