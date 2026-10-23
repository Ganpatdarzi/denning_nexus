import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { Spinner, useToast } from '../components/Ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { cx } from '../lib/format.js'

const ROLE_OPTIONS = [
  { value: 'student', label: 'Student', icon: 'cap', copy: 'Discover a field and track outcomes.' },
  { value: 'teacher', label: 'Teacher', icon: 'book', copy: 'Apply to teach and open a studio.' },
]

export default function Login() {
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState(searchParams.get('mode') === 'register' ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('student')
  const [fieldSlug, setFieldSlug] = useState('technology')
  const [headline, setHeadline] = useState('')
  const [fields, setFields] = useState([])
  const [demo, setDemo] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const { login, register } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from

  useEffect(() => {
    api.get('/fields').then((data) => setFields(data.fields)).catch(() => {})
    api
      .get('/auth/demo-accounts')
      .then((data) => setDemo(data))
      .catch(() => {})
  }, [])

  const pickDemo = (account) => {
    setMode('login')
    setError('')
    setEmail(account.email)
    setPassword(demo?.password || 'Password123!')
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'login') {
        const user = await login(email.trim(), password)
        if (user.status !== 'active') {
          toast('Sign in confirmed. Add your verification documents next.', 'success')
          navigate('/apply', { replace: true })
          return
        }
        toast(`Welcome back, ${user.name.split(' ')[0]}.`)
        navigate(from || (user.role === 'admin' ? '/app/admin' : user.role === 'teacher' ? '/app/teach' : '/app'), {
          replace: true,
        })
      } else {
        const result = await register({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          fieldSlug,
          headline: role === 'teacher' ? headline : undefined,
        })
        if (result.pending) {
          if (result.token) {
            toast('Account created. Upload your verification document next.')
            navigate('/apply', { replace: true })
          } else {
            setNotice(result.message)
            setMode('login')
            setName('')
            setPassword('')
          }
        } else {
          toast('Your campus pass is ready.')
          navigate('/app', { replace: true })
        }
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <span />
          </span>
          <span className="brand-word">
            Denning<em>Nexus</em>
          </span>
        </Link>

        <div className="auth-aside-body">
          <p className="eyebrow">Learn. Teach. Grow.</p>
          <h1>Where knowledge meets opportunity.</h1>
          <p>
            Join a vibrant community of students discovering new skills and teachers sharing what
            they know. One platform, endless possibilities.
          </p>

          <div className="auth-role-strip">
            <div>
              <span className="tone-cyan">
                <Icon name="cap" size={18} />
              </span>
              <strong>Students</strong>
              <em>field-first learning</em>
            </div>
            <div>
              <span className="tone-iris">
                <Icon name="book" size={18} />
              </span>
              <strong>Teachers</strong>
              <em>outcome-led studios</em>
            </div>
            <div>
              <span className="tone-amber">
                <Icon name="shield" size={18} />
              </span>
              <strong>Admins</strong>
              <em>every signal, one pulse</em>
            </div>
          </div>
        </div>

        <div className="auth-quote">
          <Icon name="sparkles" size={18} />
          <p>“I stopped hunting for where a question belonged. The course, the teacher and the outcome were already in the same thread.”</p>
          <span>Priya Sharma · Technology & Engineering</span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-switch">
            <button
              className={cx(mode === 'login' && 'active')}
              onClick={() => {
                setMode('login')
                setError('')
              }}
              type="button"
            >
              Sign in
            </button>
            <button
              className={cx(mode === 'register' && 'active')}
              onClick={() => {
                setMode('register')
                setError('')
              }}
              type="button"
            >
              Create account
            </button>
          </div>

          <header className="auth-head">
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p>
              {mode === 'login'
                ? 'Sign in to continue your learning journey. Demo accounts are one tap away below.'
                : 'Choose your role to get started. Teachers join after a quick administrator review.'}
            </p>
          </header>

          {notice && (
            <div className="form-notice">
              <Icon name="check" size={15} /> {notice}
            </div>
          )}
          {error && (
            <div className="form-error">
              <Icon name="flag" size={15} /> {error}
            </div>
          )}

          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && (
              <>
                <div className="role-picker">
                  {ROLE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cx('role-option', role === option.value && 'active')}
                      onClick={() => setRole(option.value)}
                    >
                      <Icon name={option.icon} size={18} />
                      <span>
                        <strong>{option.label}</strong>
                        <em>{option.copy}</em>
                      </span>
                    </button>
                  ))}
                </div>

                <label className="field">
                  <span>Full name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ada Lovelace"
                    required
                    autoComplete="name"
                  />
                </label>

                <label className="field">
                  <span>{role === 'teacher' ? 'Teaching field' : 'Your field of interest'}</span>
                  <select value={fieldSlug} onChange={(event) => setFieldSlug(event.target.value)}>
                    {fields.map((field) => (
                      <option key={field.slug} value={field.slug}>
                        {field.name}
                      </option>
                    ))}
                  </select>
                </label>

                {role === 'teacher' && (
                  <>
                    <label className="field">
                      <span>One-line headline</span>
                      <input
                        value={headline}
                        onChange={(event) => setHeadline(event.target.value)}
                        placeholder="Robotics engineer moving into the classroom"
                      />
                    </label>
                    <p className="auth-doc-note">
                      <Icon name="lock" size={14} />
                      Next you will upload an ID, teaching licence, or degree. The AI reads it first;
                      an administrator makes the final decision.
                    </p>
                  </>
                )}
              </>
            )}

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@denning.edu"
                required
                autoComplete="email"
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
                required
                minLength={mode === 'register' ? 8 : undefined}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </label>

            <button className="btn btn-primary btn-block" disabled={busy} type="submit">
              {busy ? (
                <>
                  <Spinner size={16} /> {mode === 'login' ? 'Opening campus…' : 'Creating pass…'}
                </>
              ) : (
                <>
                  {mode === 'login' ? 'Sign in' : 'Get started'}
                  <Icon name="arrow-right" size={16} />
                </>
              )}
            </button>
          </form>

          {mode === 'login' && (
            <div className="demo-block">
              <div className="demo-head">
                <span>Demo accounts</span>
                <em>{demo?.password || 'Password123!'}</em>
              </div>
              <div className="demo-chips">
                {(demo?.accounts || [
                  { name: 'Priya', role: 'student', email: 'priya@denning.edu' },
                  { name: 'Dr. Aisha', role: 'teacher', email: 'aisha@denning.edu' },
                  { name: 'Amara', role: 'admin', email: 'admin@denning.edu' },
                ])
                  .filter((account) => ['student', 'teacher', 'admin'].includes(account.role))
                  .slice(0, 3)
                  .map((account) => (
                    <button key={account.email} type="button" onClick={() => pickDemo(account)}>
                      <Icon name={account.role === 'admin' ? 'shield' : account.role === 'teacher' ? 'book' : 'cap'} size={15} />
                      <span>
                        <strong>{account.role === 'student' ? 'Student' : account.role === 'teacher' ? 'Teacher' : 'Admin'}</strong>
                        <em>{account.name}</em>
                      </span>
                    </button>
                  ))}
              </div>
              <p className="demo-note">Tap a role to fill the sign-in form instantly.</p>
            </div>
          )}

          <p className="auth-back">
            <Link to="/">
              <Icon name="arrow-left" size={14} /> Back to the public campus
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
