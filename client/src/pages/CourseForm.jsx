import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { PageHeader, Spinner, useToast } from '../components/Ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { cx } from '../lib/format.js'

const COVERS = ['reef', 'violet', 'ember', 'forest', 'dusk', 'dawn']

export default function CourseForm() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [fields, setFields] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '',
    code: '',
    fieldSlug: user.fieldSlug || '',
    level: 'Intermediate',
    mode: 'Hybrid',
    credits: 3,
    durationWeeks: 10,
    seats: 24,
    cover: 'reef',
    description: '',
    outcomes: '',
    tags: '',
  })

  useEffect(() => {
    api
      .get('/fields')
      .then((data) => {
        setFields(data.fields)
        setForm((current) => ({
          ...current,
          fieldSlug: current.fieldSlug || data.fields[0]?.slug || '',
        }))
      })
      .catch(() => {})
  }, [])

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const outcomes = form.outcomes
      .split('\n')
      .map((line) => line.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean)

    if (outcomes.length === 0) {
      setError('Add at least one learning outcome — one per line.')
      return
    }

    setSaving(true)
    try {
      const data = await api.post('/courses', {
        title: form.title,
        code: form.code || undefined,
        fieldSlug: form.fieldSlug,
        level: form.level,
        mode: form.mode,
        credits: Number(form.credits),
        durationWeeks: Number(form.durationWeeks),
        seats: Number(form.seats),
        cover: form.cover,
        description: form.description,
        outcomes,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      })
      toast(`${data.course.code} is live. Students can enrol now.`)
      navigate(`/app/teach/courses/${data.course.id}`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Teaching studio"
        title="Publish a new course."
        description="Lead with outcomes, not chapters. Students should know exactly what they will be able to do."
        actions={
          <Link className="btn btn-ghost btn-sm" to="/app/teach">
            <Icon name="arrow-left" size={15} /> Back to studio
          </Link>
        }
      />

      {error && (
        <div className="form-error">
          <Icon name="flag" size={15} /> {error}
        </div>
      )}

      <form className="card course-form" onSubmit={submit}>
        <div className="course-form-main">
          <label className="field">
            <span>Course title</span>
            <input
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
              placeholder="e.g. Applied Data Storytelling"
              required
              maxLength={90}
            />
          </label>

          <div className="form-grid">
            <label className="field">
              <span>Course code</span>
              <input
                value={form.code}
                onChange={(event) => set('code', event.target.value.toUpperCase())}
                placeholder="AUTO"
                maxLength={10}
              />
              <em className="field-hint">Leave blank to generate a code.</em>
            </label>
            <label className="field">
              <span>Field</span>
              <select
                value={form.fieldSlug}
                onChange={(event) => set('fieldSlug', event.target.value)}
                disabled={user.role === 'teacher'}
                required
              >
                {fields.map((field) => (
                  <option key={field.slug} value={field.slug}>
                    {field.name}
                  </option>
                ))}
              </select>
              {user.role === 'teacher' && (
                <em className="field-hint">You teach inside your faculty field.</em>
              )}
            </label>
          </div>

          <label className="field">
            <span>Course description</span>
            <textarea
              rows={4}
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
              placeholder="What happens in this studio? What will students ship or defend?"
              required
              maxLength={900}
            />
          </label>

          <label className="field">
            <span>Learning outcomes</span>
            <textarea
              rows={7}
              value={form.outcomes}
              onChange={(event) => set('outcomes', event.target.value)}
              placeholder={'Design and consume a REST API\nEvaluate a dataset for bias\nPresent a decision to a non-expert audience'}
              required
            />
            <em className="field-hint">
              One outcome per line, written as something a student can do. Up to 12.
            </em>
          </label>

          <label className="field">
            <span>Tags (comma separated)</span>
            <input
              value={form.tags}
              onChange={(event) => set('tags', event.target.value)}
              placeholder="React, APIs, testing"
            />
          </label>
        </div>

        <aside className="course-form-side">
          <div className="form-side-block">
            <h3>Course shape</h3>
            <label className="field">
              <span>Level</span>
              <select value={form.level} onChange={(event) => set('level', event.target.value)}>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </label>
            <label className="field">
              <span>Delivery</span>
              <select value={form.mode} onChange={(event) => set('mode', event.target.value)}>
                <option>Hybrid</option>
                <option>Online</option>
                <option>On campus</option>
              </select>
            </label>
            <div className="form-grid tight">
              <label className="field">
                <span>Credits</span>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={form.credits}
                  onChange={(event) => set('credits', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Weeks</span>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={form.durationWeeks}
                  onChange={(event) => set('durationWeeks', event.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span>Seats</span>
              <input
                type="number"
                min="1"
                max="300"
                value={form.seats}
                onChange={(event) => set('seats', event.target.value)}
              />
            </label>
          </div>

          <div className="form-side-block">
            <h3>Cover identity</h3>
            <div className="cover-picker">
              {COVERS.map((cover) => (
                <button
                  key={cover}
                  type="button"
                  className={cx('cover-swatch', `cover-${cover}`, form.cover === cover && 'active')}
                  onClick={() => set('cover', cover)}
                  aria-label={cover}
                >
                  {form.cover === cover && <Icon name="check" size={15} />}
                </button>
              ))}
            </div>
            <p className="muted small">Every field shares a palette; the cover gives each course its own weather.</p>
          </div>

          <div className="form-side-block">
            <h3>Preview</h3>
            <div className={cx('form-preview', `cover-${form.cover}`)}>
              <span className="cover-noise" />
              <span className="course-code">{form.code || 'CODE'}</span>
              <Icon name="book" size={30} />
              <strong>{form.title || 'Your course title'}</strong>
              <em>
                {form.level} · {form.durationWeeks} weeks · {form.credits} credits
              </em>
            </div>
          </div>

          <button className="btn btn-primary btn-block" disabled={saving} type="submit">
            {saving ? <Spinner size={15} /> : <Icon name="sparkles" size={15} />}
            {saving ? 'Publishing…' : 'Publish course'}
          </button>
          <p className="muted small center">
            Publishing makes the course visible to students in {fields.find((field) => field.slug === form.fieldSlug)?.name || 'your field'}.
          </p>
        </aside>
      </form>
    </div>
  )
}
