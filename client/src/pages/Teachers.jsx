import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import TeacherCard from '../components/TeacherCard.jsx'
import { Badge, EmptyState, ErrorState, Modal, PageHeader, Spinner } from '../components/Ui.jsx'
import { api } from '../lib/api.js'
import { cx } from '../lib/format.js'

export default function Teachers() {
  const [fields, setFields] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [field, setField] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    api.get('/fields').then((data) => setFields(data.fields)).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (field) params.set('field', field)
    if (search) params.set('q', search)
    api
      .get(`/teachers?${params.toString()}`)
      .then((data) => !cancelled && setTeachers(data.teachers))
      .catch((requestError) => !cancelled && setError(requestError))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [field, search])

  const fieldLookup = useMemo(
    () => Object.fromEntries(fields.map((item) => [item.slug, item])),
    [fields],
  )

  const viewCourses = async (teacher) => {
    setSelected(teacher)
    setDetail(null)
    setDetailLoading(true)
    try {
      const data = await api.get(`/teachers/${teacher.id}`)
      setDetail(data)
    } catch {
      setDetail({ courses: [] })
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="The faculty"
        title="Practitioners with an open door."
        description="Every teacher here runs a course and answers their own messages. Pick the field, then start a conversation."
        actions={<Badge tone="iris">{teachers.length} teachers active</Badge>}
      />

      <div className="filter-bar">
        <div className="filter-row">
          <div className="field-pills">
            <button className={cx('pill', !field && 'active')} onClick={() => setField('')} type="button">
              All fields
            </button>
            {fields.map((item) => (
              <button
                key={item.slug}
                className={cx('pill', field === item.slug && 'active')}
                onClick={() => setField(item.slug)}
                type="button"
              >
                <Icon name={item.icon} size={14} /> {item.name.split(' ')[0]}
              </button>
            ))}
          </div>
          <form
            className="inline-search"
            onSubmit={(event) => {
              event.preventDefault()
              setSearch(query.trim())
            }}
          >
            <Icon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search expertise or name…"
              aria-label="Search teachers"
            />
          </form>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => setSearch((value) => `${value} `)} />
      ) : loading ? (
        <div className="grid-loading">
          <Spinner size={22} /> Finding the faculty…
        </div>
      ) : teachers.length === 0 ? (
        <EmptyState
          icon="users"
          title="No faculty match that search"
          description="Try another field or a broader expertise term."
          action={
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setField('')
                setSearch('')
                setQuery('')
              }}
              type="button"
            >
              Reset
            </button>
          }
        />
      ) : (
        <div className="teacher-grid">
          {teachers.map((teacher) => (
            <TeacherCard key={teacher.id} teacher={teacher} onViewCourses={viewCourses} />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null)
          setDetail(null)
        }}
        title={selected ? `${selected.name}'s courses` : 'Courses'}
        description={selected?.headline}
      >
        {detailLoading ? (
          <div className="grid-loading">
            <Spinner size={18} /> Loading studio…
          </div>
        ) : (
          <div className="modal-course-list">
            {(detail?.courses || []).map((course) => (
              <Link
                key={course.id}
                to={`/app/courses/${course.id}`}
                className="modal-course"
                onClick={() => setSelected(null)}
              >
                <span className={`modal-course-mark cover-${course.cover}`}>
                  <Icon name={course.field?.icon || 'book'} size={18} />
                </span>
                <div>
                  <strong>{course.title}</strong>
                  <em>
                    {course.code} · {course.level} · {course.durationWeeks} weeks
                  </em>
                </div>
                <span className="modal-course-meta">
                  {course.enrolledCount}/{course.seats}
                  <Icon name="arrow-right" size={15} />
                </span>
              </Link>
            ))}
            {detail && detail.courses.length === 0 && (
              <p className="muted">This teacher has no published courses yet.</p>
            )}
            {selected && (
              <div className="modal-field-note">
                <Badge tone={fieldLookup[selected.fieldSlug]?.accent || 'muted'}>
                  {fieldLookup[selected.fieldSlug]?.name || 'Faculty'}
                </Badge>
                <Link className="btn btn-primary btn-sm" to={`/app/messages?compose=${selected.id}`}>
                  <Icon name="message" size={15} /> Start a conversation
                </Link>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
