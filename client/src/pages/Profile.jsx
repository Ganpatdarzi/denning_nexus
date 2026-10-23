import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Avatar, Badge, PageHeader, Spinner, useToast } from '../components/Ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { formatDate, roleLabel } from '../lib/format.js'

export default function Profile() {
  const { user, setUser } = useAuth()
  const { toast } = useToast()
  const [fields, setFields] = useState([])
  const [form, setForm] = useState({
    name: user.name,
    bio: user.bio || '',
    fieldSlug: user.fieldSlug || '',
    interests: (user.interests || []).join(', '),
    year: user.year || 'Year 1',
    headline: user.headline || '',
    officeHours: user.officeHours || '',
    expertise: (user.expertise || []).join(', '),
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/fields').then((data) => setFields(data.fields)).catch(() => {})
  }, [])

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        bio: form.bio,
        fieldSlug: form.fieldSlug || undefined,
      }
      if (user.role === 'student') {
        payload.interests = form.interests.split(',').map((item) => item.trim()).filter(Boolean)
        payload.year = form.year
      }
      if (user.role === 'teacher') {
        payload.headline = form.headline
        payload.officeHours = form.officeHours
        payload.expertise = form.expertise.split(',').map((item) => item.trim()).filter(Boolean)
      }
      const data = await api.patch('/me/profile', payload)
      setUser(data.user)
      toast('Profile updated across the campus.')
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const activeField = fields.find((field) => field.slug === user.fieldSlug)

  return (
    <div className="page">
      <PageHeader
        eyebrow="Your campus identity"
        title="Profile & preferences."
        description="What teachers and administrators see when your name appears in a thread, roster or field map."
        actions={<Badge tone={user.accent || 'iris'}>{roleLabel[user.role]}</Badge>}
      />

      <div className="profile-grid">
        <aside className="card profile-card">
          <Avatar person={user} size={84} />
          <h2>{user.name}</h2>
          <p>{user.headline || `${user.year || roleLabel[user.role]} · ${activeField?.name || 'Open field'}`}</p>
          <div className="profile-badges">
            <Badge tone={activeField?.accent || 'muted'} dot>
              {activeField?.name || 'No field yet'}
            </Badge>
            <Badge tone="lime">Active</Badge>
          </div>
          <div className="profile-facts">
            <div>
              <span>Email</span>
              <strong>{user.email}</strong>
            </div>
            <div>
              <span>Joined</span>
              <strong>{formatDate(user.createdAt)}</strong>
            </div>
            <div>
              <span>Role</span>
              <strong>{roleLabel[user.role]}</strong>
            </div>
            {user.role === 'teacher' && (
              <div>
                <span>Rating</span>
                <strong>{user.rating?.toFixed(1) || 'New'}</strong>
              </div>
            )}
          </div>
          {user.role === 'student' && (
            <div className="profile-interests">
              <span>Interests</span>
              <div className="chip-row">
                {(user.interests || []).length === 0 && <em className="muted small">Add a few below</em>}
                {(user.interests || []).map((interest) => (
                  <span className="chip" key={interest}>
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>

        <form className="card profile-form" onSubmit={submit}>
          <div className="section-head compact">
            <div>
              <p className="eyebrow">Editable details</p>
              <h2>The parts of your record you own</h2>
            </div>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Full name</span>
              <input value={form.name} onChange={(event) => set('name', event.target.value)} required minLength={2} />
            </label>
            <label className="field">
              <span>Email</span>
              <input value={user.email} disabled />
              <em className="field-hint">Email changes are handled by the administrator.</em>
            </label>
          </div>

          <label className="field">
            <span>Short bio</span>
            <textarea
              rows={3}
              value={form.bio}
              onChange={(event) => set('bio', event.target.value)}
              placeholder="A sentence or two about what you care about."
              maxLength={500}
            />
          </label>

          <label className="field">
            <span>{user.role === 'teacher' ? 'Faculty field' : 'Field of interest'}</span>
            <select
              value={form.fieldSlug}
              onChange={(event) => set('fieldSlug', event.target.value)}
              disabled={user.role === 'teacher'}
            >
              <option value="">Not chosen</option>
              {fields.map((field) => (
                <option key={field.slug} value={field.slug}>
                  {field.name}
                </option>
              ))}
            </select>
            {user.role === 'teacher' && (
              <em className="field-hint">Moving faculty fields requires an administrator.</em>
            )}
          </label>

          {user.role === 'student' && (
            <>
              <div className="form-grid">
                <label className="field">
                  <span>Year</span>
                  <select value={form.year} onChange={(event) => set('year', event.target.value)}>
                    <option>Year 1</option>
                    <option>Year 2</option>
                    <option>Year 3</option>
                    <option>Year 4</option>
                    <option>Postgraduate</option>
                  </select>
                </label>
                <label className="field">
                  <span>Interests (comma separated)</span>
                  <input
                    value={form.interests}
                    onChange={(event) => set('interests', event.target.value)}
                    placeholder="Cloud, product, accessibility"
                  />
                </label>
              </div>
            </>
          )}

          {user.role === 'teacher' && (
            <>
              <label className="field">
                <span>Headline</span>
                <input
                  value={form.headline}
                  onChange={(event) => set('headline', event.target.value)}
                  placeholder="One line students will remember."
                  maxLength={160}
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>Office hours</span>
                  <input
                    value={form.officeHours}
                    onChange={(event) => set('officeHours', event.target.value)}
                    placeholder="Tue & Thu · 14:00–16:00"
                  />
                </label>
                <label className="field">
                  <span>Expertise (comma separated)</span>
                  <input
                    value={form.expertise}
                    onChange={(event) => set('expertise', event.target.value)}
                    placeholder="Distributed systems, Node.js"
                  />
                </label>
              </div>
            </>
          )}

          <div className="form-actions">
            <button className="btn btn-primary" disabled={saving} type="submit">
              {saving ? <Spinner size={15} /> : <Icon name="check" size={15} />}
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            <span className="muted small">
              <Icon name="lock" size={12} /> Only administrators can see your account status.
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}
