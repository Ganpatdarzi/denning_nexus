import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import CourseCard from '../components/CourseCard.jsx'
import { Badge } from '../components/Ui.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'

const ROLE_CARDS = [
  {
    icon: 'cap',
    title: 'For students',
    copy: 'Choose a field, compare courses, track every outcome you master and talk directly to the person teaching you.',
    points: ['Field-first course discovery', 'Outcome progress you can see', 'A direct line to your teachers'],
  },
  {
    icon: 'book',
    title: 'For teachers',
    copy: 'Publish a course in minutes, follow each student’s outcome progress and answer questions without leaving the studio.',
    points: ['A teaching studio built for one course', 'Roster progress, not just attendance', 'Threaded questions per course'],
  },
  {
    icon: 'shield',
    title: 'For administrators',
    copy: 'See every interaction across the campus, approve faculty and send one message that reaches the right people.',
    points: ['Live pulse of all conversations', 'Faculty approvals and access control', 'Targeted campus broadcasts'],
  },
]

export default function Landing() {
  const { user } = useAuth()
  const [fields, setFields] = useState([])
  const [courses, setCourses] = useState([])
  const [teachers, setTeachers] = useState([])

  useEffect(() => {
    Promise.all([api.get('/fields'), api.get('/courses?sort=rating'), api.get('/teachers')])
      .then(([fieldData, courseData, teacherData]) => {
        setFields(fieldData.fields)
        setCourses(courseData.courses.slice(0, 3))
        setTeachers(teacherData.teachers)
      })
      .catch(() => {})
  }, [])

  const outcomeCount = courses.reduce((sum, course) => sum + (course.outcomeCount || 0), 0)
  const entry = user ? '/app' : '/login'

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <span />
          </span>
          <span className="brand-word">
            Denning<em>Nexus</em>
          </span>
        </Link>
        <nav>
          <a href="#fields">Fields</a>
          <a href="#courses">Courses</a>
          <a href="#how">How it works</a>
          <a href="#roles">For teachers & students</a>
        </nav>
        <div className="landing-nav-actions">
          {user ? (
            <Link className="btn btn-primary btn-sm" to="/app">
              Go to dashboard <Icon name="arrow-right" size={15} />
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost btn-sm" to="/login">
                Sign in
              </Link>
              <Link className="btn btn-primary btn-sm" to="/login?mode=register">
                Get started free <Icon name="arrow-right" size={15} />
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <Badge tone="lime" dot>
            A field-first learning network
          </Badge>
          <h1>
            Where ambitious
            <br />
            students and
            <br />
            <span className="hero-glow">inspired teachers</span>
            <br />
            grow together.
          </h1>
          <p>
            Denning Nexus connects learners, educators and administrators in one beautiful,
            outcome-driven campus. Discover courses, track real skills, and build meaningful
            relationships that last beyond the classroom.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-primary" to={entry}>
              {user ? 'Enter your campus' : 'Start learning for free'} <Icon name="arrow-right" size={17} />
            </Link>
            <Link className="btn btn-ghost" to="/login?mode=register">
              Become a teacher <Icon name="arrow-right" size={17} />
            </Link>
          </div>
          <div className="hero-proof">
            <div>
              <strong>{fields.length || 5}</strong>
              <span>learning fields</span>
            </div>
            <div>
              <strong>{courses.length ? courses.length * 4 : 12}+</strong>
              <span>live courses</span>
            </div>
            <div>
              <strong>{teachers.length || 6}</strong>
              <span>practitioner teachers</span>
            </div>
          </div>
        </div>

        <div className="orbit-stage" aria-hidden="true">
          <div className="orbit-aura" />
          <div className="orbit-ring ring-a" />
          <div className="orbit-ring ring-b" />
          <div className="orbit-ring ring-c" />
          <div className="orbit-core">
            <span className="brand-mark large">
              <span />
            </span>
            <strong>Nexus</strong>
            <em>the campus, connected</em>
          </div>
          <div className="orbit-node node-a">
            <span className="orbit-node-icon tone-cyan">
              <Icon name="users" size={17} />
            </span>
            <span>
              <strong>Students</strong>
              <em>discover & track</em>
            </span>
          </div>
          <div className="orbit-node node-b">
            <span className="orbit-node-icon tone-iris">
              <Icon name="book" size={17} />
            </span>
            <span>
              <strong>Teachers</strong>
              <em>teach & respond</em>
            </span>
          </div>
          <div className="orbit-node node-c">
            <span className="orbit-node-icon tone-amber">
              <Icon name="shield" size={17} />
            </span>
            <span>
              <strong>Admin</strong>
              <em>listen & guide</em>
            </span>
          </div>
          <div className="orbit-node node-d">
            <span className="orbit-node-icon tone-lime">
              <Icon name="target" size={17} />
            </span>
            <span>
              <strong>Outcomes</strong>
              <em>{outcomeCount || 48} tracked</em>
            </span>
          </div>
          <div className="orbit-ticker">
            <span className="pulse-dot" />
            Live signal · a question was answered 3m ago
          </div>
        </div>
      </section>

      <section className="landing-section" id="fields">
        <div className="section-head">
          <div>
            <p className="eyebrow">Start with your field</p>
            <h2>Five worlds. One campus.</h2>
          </div>
          <p>
            Every course belongs to a field, every field has practitioners, and every practitioner
            has an open door.
          </p>
        </div>
        <div className="field-grid">
          {fields.map((field) => (
            <Link className="field-card" to="/login" key={field.slug}>
              <span className={`field-icon tone-${field.accent}`}>
                <Icon name={field.icon} size={22} />
              </span>
              <h3>{field.name}</h3>
              <p>{field.tagline}</p>
              <div className="field-stats">
                <span>{field.courseCount} courses</span>
                <span>{field.teacherCount} teachers</span>
              </div>
              <span className="field-link">
                Explore field <Icon name="arrow-right" size={14} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="landing-section" id="courses">
        <div className="section-head">
          <div>
            <p className="eyebrow">Currently live</p>
            <h2>Courses with outcomes, not just readings.</h2>
          </div>
          <p>
            Each course is a small promise: finish the outcomes, leave with something you can
            defend.
          </p>
        </div>
        <div className="course-grid landing-courses">
          {courses.map((course) => (
            <CourseCard course={course} key={course.id} />
          ))}
        </div>
      </section>

      <section className="landing-section" id="how">
        <div className="section-head">
          <div>
            <p className="eyebrow">How Nexus works</p>
            <h2>One thread from curiosity to mastery.</h2>
          </div>
          <p>No disconnected portals. The same signal reaches the student, the teacher and the campus lead.</p>
        </div>
        <div className="how-grid">
          {[
            {
              step: '01',
              title: 'Choose a field',
              copy: 'Tell us where you are headed. Your catalogue, teachers and recommendations reorder around it.',
              icon: 'compass',
            },
            {
              step: '02',
              title: 'Track real outcomes',
              copy: 'Every course lists what you will be able to do. Mark outcomes as you achieve them and watch progress become evidence.',
              icon: 'target',
            },
            {
              step: '03',
              title: 'Talk to the person teaching',
              copy: 'Open a course-scoped thread. Questions, feedback and context stay together instead of scattering across inboxes.',
              icon: 'message',
            },
            {
              step: '04',
              title: 'The campus listens',
              copy: 'Administrators see the pulse of every interaction, approve faculty and broadcast to the right audience.',
              icon: 'pulse',
            },
          ].map((item) => (
            <article className="how-card" key={item.step}>
              <div className="how-top">
                <span className="how-step">{item.step}</span>
                <Icon name={item.icon} size={20} />
              </div>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="roles">
        <div className="section-head">
          <div>
            <p className="eyebrow">Built for three roles</p>
            <h2>Designed to help students learn and teachers inspire.</h2>
          </div>
          <p>
            Whether you're mastering new skills or sharing what you know, Denning Nexus gives you
            the tools to do it beautifully.
          </p>
        </div>
        <div className="role-grid">
          {ROLE_CARDS.map((card) => (
            <article className="role-card" key={card.title}>
              <span className="role-icon">
                <Icon name={card.icon} size={22} />
              </span>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
              <ul>
                {card.points.map((point) => (
                  <li key={point}>
                    <Icon name="check" size={14} /> {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div>
          <p className="eyebrow">Ready when you are</p>
          <h2>Start learning or teaching today.</h2>
          <p>Join students mastering in-demand skills and teachers building thriving classrooms on Denning Nexus.</p>
        </div>
        <div className="cta-actions">
          <Link className="btn btn-primary" to="/login?mode=register">
            Join as a student <Icon name="arrow-right" size={16} />
          </Link>
          <Link className="btn btn-ghost" to="/login?mode=register">
            Apply to teach <Icon name="arrow-right" size={16} />
          </Link>
        </div>
      </section>

      <footer className="landing-foot">
        <div className="brand">
          <span className="brand-mark">
            <span />
          </span>
          <span className="brand-word">
            Denning<em>Nexus</em>
          </span>
        </div>
        <p>Empowering students to learn and teachers to inspire, together.</p>
        <span>Built for modern education</span>
      </footer>
    </div>
  )
}
