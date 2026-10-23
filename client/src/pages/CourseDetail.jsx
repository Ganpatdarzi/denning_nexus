import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { Avatar, Badge, ErrorState, Modal, PageLoader, ProgressBar, ProgressRing, Spinner, useToast } from '../components/Ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { cx, levelTone } from '../lib/format.js'

export default function CourseDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [enrolling, setEnrolling] = useState(false)
  const [busyOutcome, setBusyOutcome] = useState(null)
  const [confirmDrop, setConfirmDrop] = useState(false)
  const [dropping, setDropping] = useState(false)

  const load = useCallback(() => {
    setError(null)
    api
      .get(`/courses/${id}`)
      .then(setData)
      .catch(setError)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!data) return <PageLoader label="Opening the course map…" />

  const { course, enrollment, canManage } = data
  const isStudent = user.role === 'student'
  const doneIds = new Set(enrollment?.doneOutcomeIds || [])
  const progress = enrollment?.progress || { done: 0, total: course.outcomeCount, percent: 0 }

  const enrol = async () => {
    setEnrolling(true)
    try {
      await api.post('/me/enrollments', { courseId: course.id })
      toast(`You joined ${course.code}. Your outcomes are ready to track.`)
      window.dispatchEvent(new Event('nexus:signals'))
      load()
    } catch (requestError) {
      toast(requestError.message, 'error')
    } finally {
      setEnrolling(false)
    }
  }

  const drop = async () => {
    setDropping(true)
    try {
      await api.del(`/me/enrollments/${course.id}`)
      toast(`You left ${course.code}.`)
      setConfirmDrop(false)
      load()
    } catch (requestError) {
      toast(requestError.message, 'error')
    } finally {
      setDropping(false)
    }
  }

  const toggleOutcome = async (outcome) => {
    if (!enrollment) return
    const done = !doneIds.has(outcome.id)
    setBusyOutcome(outcome.id)
    try {
      const result = await api.patch(`/me/enrollments/${course.id}/outcomes`, {
        outcomeId: outcome.id,
        done,
      })
      setData((current) => ({ ...current, enrollment: result.enrollment }))
      if (result.completedCourse) {
        toast(`All outcomes complete. ${course.code} is finished.`)
      } else {
        toast(done ? 'Outcome marked as achieved.' : 'Outcome reopened for another pass.')
      }
    } catch (requestError) {
      toast(requestError.message, 'error')
    } finally {
      setBusyOutcome(null)
    }
  }

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/app/explore">
          <Icon name="arrow-left" size={14} /> Catalogue
        </Link>
        <span>/</span>
        <Link to={`/app/explore?field=${course.fieldSlug}`}>{course.field?.name}</Link>
        <span>/</span>
        <em>{course.code}</em>
      </div>

      <div className="course-detail">
        <div className="course-detail-main">
          <section className={`course-hero cover-${course.cover}`}>
            <span className="cover-noise" />
            <div className="course-hero-top">
              <span className="course-code large">{course.code}</span>
              <Badge tone={levelTone[course.level]}>{course.level}</Badge>
              {!course.published && <Badge tone="rose">Draft</Badge>}
            </div>
            <h1>{course.title}</h1>
            <p>{course.description}</p>
            <div className="course-hero-meta">
              <span>
                <Icon name="users" size={15} /> {course.enrolledCount} enrolled · {course.seatsLeft} seats left
              </span>
              <span>
                <Icon name="clock" size={15} /> {course.durationWeeks} weeks
              </span>
              <span>
                <Icon name="cap" size={15} /> {course.credits} credits
              </span>
              <span>
                <Icon name="compass" size={15} /> {course.mode}
              </span>
            </div>
            <Icon name={course.field?.icon || 'book'} size={150} className="course-hero-glyph" />
          </section>

          <section className="card">
            <div className="section-head compact">
              <div>
                <p className="eyebrow">Learning outcomes</p>
                <h2>What you will be able to do</h2>
              </div>
              <Badge tone={progress.percent === 100 ? 'lime' : 'muted'}>
                {progress.done}/{progress.total} achieved
              </Badge>
            </div>

            {enrollment && (
              <div className="outcome-progress">
                <ProgressBar value={progress.percent} tone={progress.percent === 100 ? 'cyan' : 'lime'} />
                <span>{progress.percent}%</span>
              </div>
            )}

            <ul className="outcome-list">
              {course.outcomes.map((outcome, index) => {
                const achieved = doneIds.has(outcome.id)
                const interactive = isStudent && Boolean(enrollment)
                return (
                  <li key={outcome.id} className={cx('outcome-item', achieved && 'achieved')}>
                    <button
                      type="button"
                      className={cx('outcome-check', achieved && 'checked')}
                      onClick={() => interactive && toggleOutcome(outcome)}
                      disabled={!interactive || busyOutcome === outcome.id}
                      aria-label={achieved ? 'Mark as not achieved' : 'Mark as achieved'}
                    >
                      {busyOutcome === outcome.id ? (
                        <Spinner size={14} />
                      ) : achieved ? (
                        <Icon name="check" size={14} />
                      ) : (
                        <span>{String(index + 1).padStart(2, '0')}</span>
                      )}
                    </button>
                    <div>
                      <p>{outcome.text}</p>
                      <span>{achieved ? 'Achieved' : interactive ? 'Tap to track this outcome' : 'Tracked once you enrol'}</span>
                    </div>
                  </li>
                )
              })}
            </ul>

            {!isStudent && (
              <p className="muted small">
                {canManage
                  ? 'You manage this course. Open the studio to edit outcomes and see the roster.'
                  : 'Outcome tracking is available to enrolled students.'}
              </p>
            )}
          </section>

          <section className="card">
            <div className="section-head compact">
              <div>
                <p className="eyebrow">Inside the studio</p>
                <h2>How this course runs</h2>
              </div>
            </div>
            <div className="detail-facts">
              <div>
                <span>Delivery</span>
                <strong>{course.mode}</strong>
              </div>
              <div>
                <span>Duration</span>
                <strong>{course.durationWeeks} weeks</strong>
              </div>
              <div>
                <span>Credits</span>
                <strong>{course.credits}</strong>
              </div>
              <div>
                <span>Assessment</span>
                <strong>Outcome portfolio</strong>
              </div>
            </div>
            <div className="chip-row">
              {course.tags.map((tag) => (
                <span className="chip" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </section>
        </div>

        <aside className="course-detail-side">
          {isStudent && (
            <section className="card enroll-card">
              {enrollment ? (
                <>
                  <div className="enroll-head">
                    <ProgressRing value={progress.percent} size={84} stroke={8} sublabel="done" />
                    <div>
                      <p className="eyebrow">You are enrolled</p>
                      <h3>{enrollment.status === 'completed' ? 'Course complete' : 'Keep the orbit moving'}</h3>
                      <span className="muted small">
                        {progress.total - progress.done} outcomes left · since{' '}
                        {new Date(enrollment.enrolledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm btn-block"
                    onClick={() => setConfirmDrop(true)}
                    type="button"
                  >
                    Leave this course
                  </button>
                </>
              ) : (
                <>
                  <p className="eyebrow">Open enrolment</p>
                  <h3>Take this course</h3>
                  <p className="muted small">
                    {course.seatsLeft > 0
                      ? `${course.seatsLeft} seats remain. Enrol and all ${course.outcomeCount} outcomes become trackable.`
                      : 'This course is full. Message the teacher to join the waitlist.'}
                  </p>
                  <button
                    className="btn btn-primary btn-block"
                    onClick={enrol}
                    disabled={enrolling || course.seatsLeft === 0}
                    type="button"
                  >
                    {enrolling ? <Spinner size={16} /> : <Icon name="plus" size={16} />}
                    {enrolling ? 'Adding you…' : 'Enrol in this course'}
                  </button>
                  <ul className="enroll-points">
                    <li>
                      <Icon name="check" size={13} /> Outcome tracking from day one
                    </li>
                    <li>
                      <Icon name="check" size={13} /> Direct thread with the teacher
                    </li>
                    <li>
                      <Icon name="check" size={13} /> Progress visible to your teacher
                    </li>
                  </ul>
                </>
              )}
            </section>
          )}

          {canManage && (
            <section className="card manage-card">
              <p className="eyebrow">Course controls</p>
              <h3>You teach this studio</h3>
              <div className="stack">
                <Link className="btn btn-soft btn-sm btn-block" to={`/app/teach/courses/${course.id}`}>
                  <Icon name="users" size={15} /> Open roster & edit
                </Link>
                <Link className="btn btn-ghost btn-sm btn-block" to={`/app/teach/courses/${course.id}?edit=1`}>
                  <Icon name="edit" size={15} /> Edit outcomes
                </Link>
              </div>
            </section>
          )}

          <section className="card teacher-panel">
            <div className="teacher-panel-head">
              <Avatar person={course.teacher} size={56} />
              <div>
                <p className="eyebrow">Your teacher</p>
                <h3>{course.teacher?.name}</h3>
                <span className="teacher-panel-rating">
                  <Icon name="star" size={13} /> {course.teacher?.rating?.toFixed(1) || 'New'} · {course.teacher?.courseCount} courses
                </span>
              </div>
            </div>
            <p className="teacher-panel-headline">{course.teacher?.headline}</p>
            <div className="chip-row">
              {(course.teacher?.expertise || []).slice(0, 3).map((item) => (
                <span className="chip" key={item}>
                  {item}
                </span>
              ))}
            </div>
            <div className="teacher-panel-meta">
              <span>
                <Icon name="clock" size={14} /> {course.teacher?.officeHours}
              </span>
              <span>
                <Icon name="users" size={14} /> {course.teacher?.studentCount} students
              </span>
            </div>
            <button
              className="btn btn-primary btn-sm btn-block"
              onClick={() =>
                navigate(`/app/messages?compose=${course.teacher?.id}&course=${course.id}`)
              }
              type="button"
            >
              <Icon name="message" size={15} /> Message {course.teacher?.name?.split(' ').slice(-1)[0]}
            </button>
          </section>

          <section className="card course-side-meta">
            <div>
              <span>Field</span>
              <strong>{course.field?.name}</strong>
            </div>
            <div>
              <span>Credits</span>
              <strong>{course.credits} credits</strong>
            </div>
            <div>
              <span>Class size</span>
              <strong>{course.enrolledCount}/{course.seats}</strong>
            </div>
            <div>
              <span>Language</span>
              <strong>English</strong>
            </div>
          </section>
        </aside>
      </div>

      <Modal
        open={confirmDrop}
        onClose={() => setConfirmDrop(false)}
        title={`Leave ${course.code}?`}
        description="Your achieved outcomes on this course will be removed from your record."
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDrop(false)} type="button">
              Keep course
            </button>
            <button className="btn btn-danger btn-sm" onClick={drop} disabled={dropping} type="button">
              {dropping ? <Spinner size={14} /> : null} Leave course
            </button>
          </>
        }
      >
        <p className="muted">
          You can re-enrol later, but any outcome progress will start from zero. Your conversations
          with the teacher stay in Messages.
        </p>
      </Modal>
    </div>
  )
}
