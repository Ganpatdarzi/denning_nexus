import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import CourseCard from '../components/CourseCard.jsx'
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../components/Ui.jsx'
import { api } from '../lib/api.js'
import { cx } from '../lib/format.js'

const LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const MODES = ['Online', 'Hybrid', 'On campus']

export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [fields, setFields] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [total, setTotal] = useState(0)

  const field = searchParams.get('field') || ''
  const level = searchParams.get('level') || ''
  const mode = searchParams.get('mode') || ''
  const sort = searchParams.get('sort') || 'rating'
  const q = searchParams.get('q') || ''

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    api.get('/fields').then((data) => setFields(data.fields)).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (field) params.set('field', field)
    if (level) params.set('level', level)
    if (mode) params.set('mode', mode)
    if (q) params.set('q', q)
    params.set('sort', sort)
    api
      .get(`/courses?${params.toString()}`)
      .then((data) => {
        if (cancelled) return
        setCourses(data.courses)
        setTotal(data.total)
      })
      .catch((requestError) => !cancelled && setError(requestError))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [field, level, mode, sort, q])

  const activeField = useMemo(() => fields.find((item) => item.slug === field), [fields, field])
  const filtersActive = Boolean(field || level || mode || q)

  const submitSearch = (event) => {
    event.preventDefault()
    setParam('q', query.trim())
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Field-first catalogue"
        title="Find the course that fits your field."
        description="Filter by world, depth and delivery. Every course shows the outcomes you will actually leave with."
        actions={
          <Badge tone="lime" dot>
            {total} courses open
          </Badge>
        }
      />

      <div className="filter-bar">
        <div className="filter-row">
          <div className="field-pills">
            <button
              className={cx('pill', !field && 'active')}
              onClick={() => setParam('field', '')}
              type="button"
            >
              All fields
            </button>
            {fields.map((item) => (
              <button
                key={item.slug}
                className={cx('pill', field === item.slug && 'active')}
                onClick={() => setParam('field', item.slug)}
                type="button"
              >
                <Icon name={item.icon} size={14} /> {item.name.split(' ')[0]}
              </button>
            ))}
          </div>
          <form className="inline-search" onSubmit={submitSearch}>
            <Icon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, code, teacher…"
              aria-label="Search courses"
            />
            {query && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => {
                  setQuery('')
                  setParam('q', '')
                }}
                aria-label="Clear search"
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </form>
        </div>

        <div className="filter-row secondary">
          <div className="select-group">
            <label>
              <span>Level</span>
              <select value={level} onChange={(event) => setParam('level', event.target.value)}>
                <option value="">Any level</option>
                {LEVELS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Delivery</span>
              <select value={mode} onChange={(event) => setParam('mode', event.target.value)}>
                <option value="">Any mode</option>
                {MODES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select value={sort} onChange={(event) => setParam('sort', event.target.value)}>
                <option value="rating">Top rated</option>
                <option value="popular">Most enrolled</option>
                <option value="newest">Newest</option>
                <option value="title">A–Z</option>
              </select>
            </label>
          </div>
          {filtersActive && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSearchParams({ sort }, { replace: true })}
              type="button"
            >
              <Icon name="x" size={14} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {activeField && (
        <div className={`field-banner tone-${activeField.accent}`}>
          <span className="field-icon">
            <Icon name={activeField.icon} size={22} />
          </span>
          <div>
            <h2>{activeField.name}</h2>
            <p>{activeField.description}</p>
          </div>
          <div className="field-banner-stats">
            <span>
              <strong>{activeField.courseCount}</strong> courses
            </span>
            <span>
              <strong>{activeField.teacherCount}</strong> teachers
            </span>
            <span>
              <strong>{activeField.studentCount}</strong> students
            </span>
          </div>
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => setSearchParams(new URLSearchParams(searchParams), { replace: true })} />
      ) : loading ? (
        <div className="grid-loading">
          <Spinner size={22} /> Loading the catalogue…
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon="compass"
          title="No courses match that map"
          description="Try a different field, level or search term. The catalogue changes every term."
          action={
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQuery('')
                setSearchParams({ sort }, { replace: true })
              }}
              type="button"
            >
              Reset filters
            </button>
          }
        />
      ) : (
        <>
          <div className="result-line">
            <span>
              Showing <strong>{courses.length}</strong> of {total} courses
            </span>
            <span className="muted">Outcome-led · direct teacher access</span>
          </div>
          <div className="course-grid">
            {courses.map((course) => (
              <CourseCard course={course} key={course.id} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
