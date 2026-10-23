import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { Avatar, Badge } from './Ui.jsx'

export default function TeacherCard({ teacher, onViewCourses }) {
  return (
    <article className="teacher-card">
      <div className="teacher-top">
        <Avatar person={teacher} size={54} />
        <div className="teacher-id">
          <h3>{teacher.name}</h3>
          <p>{teacher.headline}</p>
        </div>
        {teacher.rating > 0 && (
          <span className="teacher-rating">
            <Icon name="star" size={13} /> {teacher.rating.toFixed(1)}
          </span>
        )}
      </div>

      <div className="chip-row">
        {(teacher.expertise || []).slice(0, 3).map((item) => (
          <span className="chip" key={item}>
            {item}
          </span>
        ))}
      </div>

      <div className="teacher-meta">
        <span>
          <Icon name="book" size={14} /> {teacher.courseCount} courses
        </span>
        <span>
          <Icon name="users" size={14} /> {teacher.studentCount} students
        </span>
        <span>
          <Icon name="clock" size={14} /> {teacher.officeHours}
        </span>
      </div>

      <div className="teacher-actions">
        <Link className="btn btn-ghost btn-sm" to={`/app/messages?compose=${teacher.id}`}>
          <Icon name="message" size={15} /> Message
        </Link>
        <button className="btn btn-soft btn-sm" onClick={() => onViewCourses?.(teacher)} type="button">
          View courses <Icon name="arrow-right" size={15} />
        </button>
      </div>
    </article>
  )
}

export function ContactRow({ person, subtitle, meta, action }) {
  return (
    <div className="contact-row">
      <Avatar person={person} size={38} />
      <div className="contact-info">
        <strong>{person.name}</strong>
        <span>{subtitle}</span>
      </div>
      {meta && <Badge tone="muted">{meta}</Badge>}
      {action}
    </div>
  )
}
