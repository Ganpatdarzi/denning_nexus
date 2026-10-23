import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Spinner,
  useToast,
} from '../components/Ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { cx, dayLabel, formatTime, relativeTime, roleLabel } from '../lib/format.js'

const emptyCompose = { recipientId: '', courseId: '', subject: '', body: '' }

function otherParticipant(thread, user) {
  return thread.participants.find((person) => person.id !== user.id) || thread.participants[0]
}

function threadTitle(thread, user) {
  if (user.role === 'admin') {
    return thread.participants.map((person) => person.name).join(' ↔ ')
  }
  return otherParticipant(thread, user)?.name || 'Conversation'
}

export default function Messages() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeId = searchParams.get('thread')
  const composeParam = searchParams.get('compose')
  const courseParam = searchParams.get('course')

  const [threads, setThreads] = useState([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [threadsError, setThreadsError] = useState(null)
  const [threadSearch, setThreadSearch] = useState('')
  const [activeThread, setActiveThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [threadError, setThreadError] = useState(null)
  const [threadReloadKey, setThreadReloadKey] = useState(0)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [contacts, setContacts] = useState([])
  const [composeOpen, setComposeOpen] = useState(false)
  const [compose, setCompose] = useState(emptyCompose)
  const [creating, setCreating] = useState(false)
  const scrollRef = useRef(null)

  const loadThreads = useCallback(async () => {
    try {
      const data = await api.get('/threads')
      setThreads(data.threads)
      setThreadsError(null)
    } catch (error) {
      setThreadsError(error)
    } finally {
      setThreadsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadThreads()
    const timer = window.setInterval(loadThreads, 30_000)
    return () => window.clearInterval(timer)
  }, [loadThreads])

  useEffect(() => {
    api.get('/me/contacts').then((data) => setContacts(data.contacts)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!composeParam || !contacts.length) return
    setCompose({
      ...emptyCompose,
      recipientId: composeParam,
      courseId: courseParam || '',
    })
    setComposeOpen(true)
  }, [composeParam, courseParam, contacts])

  useEffect(() => {
    if (!activeId) {
      setActiveThread(null)
      setMessages([])
      setThreadError(null)
      setReply('')
      return undefined
    }
    let cancelled = false
    setThreadError(null)
    setReply('')
    setActiveThread((current) => (current?.id === activeId ? current : null))
    setMessages([])

    const load = async () => {
      try {
        const data = await api.get(`/threads/${activeId}`)
        if (cancelled) return
        setActiveThread(data.thread)
        setMessages(data.messages)
        setThreadError(null)
        if (data.thread.unreadCount > 0) {
          await api.patch(`/threads/${activeId}/read`)
          if (cancelled) return
          setThreads((current) =>
            current.map((thread) =>
              thread.id === activeId ? { ...thread, unreadCount: 0 } : thread,
            ),
          )
          window.dispatchEvent(new Event('nexus:signals'))
        }
      } catch (error) {
        if (!cancelled) {
          setThreadError(error)
          toast(error.message, 'error')
        }
      }
    }

    load()
    const timer = window.setInterval(load, 20_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeId, threadReloadKey, toast])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, activeThread])

  const selectThread = (id) => {
    const next = new URLSearchParams(searchParams)
    next.set('thread', id)
    next.delete('compose')
    next.delete('course')
    setSearchParams(next, { replace: true })
  }

  const closeCompose = () => {
    setComposeOpen(false)
    setCompose(emptyCompose)
    const next = new URLSearchParams(searchParams)
    next.delete('compose')
    next.delete('course')
    setSearchParams(next, { replace: true })
  }

  const openNew = () => {
    setCompose(emptyCompose)
    setComposeOpen(true)
  }

  const filteredThreads = useMemo(() => {
    if (!threadSearch.trim()) return threads
    const needle = threadSearch.toLowerCase()
    return threads.filter(
      (thread) =>
        thread.subject.toLowerCase().includes(needle) ||
        thread.participants.some((person) => person.name.toLowerCase().includes(needle)) ||
        (thread.course?.code || '').toLowerCase().includes(needle),
    )
  }, [threads, threadSearch])

  const selectedContact = contacts.find((person) => person.id === compose.recipientId)
  const contactCourses = selectedContact?.courses || []

  const createThread = async (event) => {
    event.preventDefault()
    if (!compose.recipientId) {
      toast('Choose who you want to talk to.', 'error')
      return
    }
    setCreating(true)
    try {
      const data = await api.post('/threads', {
        recipientId: compose.recipientId,
        courseId: compose.courseId || undefined,
        subject: compose.subject,
        body: compose.body,
      })
      toast('Conversation opened.')
      setComposeOpen(false)
      setCompose(emptyCompose)
      await loadThreads()
      selectThread(data.thread.id)
      window.dispatchEvent(new Event('nexus:signals'))
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  const sendReply = async (event) => {
    event.preventDefault()
    if (!reply.trim() || !activeId) return
    setSending(true)
    try {
      const data = await api.post(`/threads/${activeId}/messages`, { body: reply.trim() })
      setMessages((current) => [...current, data.message])
      setReply('')
      setActiveThread(data.thread)
      await loadThreads()
      window.dispatchEvent(new Event('nexus:signals'))
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setSending(false)
    }
  }

  const other = activeThread ? otherParticipant(activeThread, user) : null
  const isAdmin = user.role === 'admin'

  return (
    <div className="page page-messages">
      <PageHeader
        eyebrow={isAdmin ? 'Campus moderation' : 'Direct lines'}
        title={isAdmin ? 'Every conversation, one pulse.' : 'Conversations that stay in context.'}
        description={
          isAdmin
            ? 'You can read and join any student–teacher thread. Replies from this view are marked as moderator messages.'
            : 'Threads are attached to the course and the people involved, so no one has to re-explain the context.'
        }
        actions={
          <button className="btn btn-primary btn-sm" onClick={openNew} type="button">
            <Icon name="plus" size={16} /> New conversation
          </button>
        }
      />

      {isAdmin && (
        <div className="moderation-banner">
          <Icon name="shield" size={16} />
          <span>
            Moderator view · <strong>{threads.length}</strong> conversations across the campus ·{' '}
            <strong>{threads.reduce((sum, thread) => sum + thread.unreadCount, 0)}</strong> unread signals
          </span>
        </div>
      )}

      <div className={cx('messages-shell', activeId && 'has-active')}>
        <aside className="thread-list">
          <div className="thread-list-head">
            <div>
              <h2>Inbox</h2>
              <span>{threads.length} threads</span>
            </div>
            <button className="icon-btn" onClick={loadThreads} title="Refresh" type="button">
              <Icon name="sparkles" size={16} />
            </button>
          </div>
          <div className="thread-search">
            <Icon name="search" size={15} />
            <input
              value={threadSearch}
              onChange={(event) => setThreadSearch(event.target.value)}
              placeholder="Find a person or subject…"
              aria-label="Search conversations"
            />
          </div>

          <div className="thread-scroll">
            {threadsLoading ? (
              <div className="grid-loading small">
                <Spinner size={18} /> Loading threads…
              </div>
            ) : threadsError ? (
              <ErrorState error={threadsError} onRetry={loadThreads} />
            ) : filteredThreads.length === 0 ? (
              <p className="thread-empty">No conversations yet. Start one with a teacher or student.</p>
            ) : (
              filteredThreads.map((thread) => {
                const person = otherParticipant(thread, user)
                return (
                  <button
                    key={thread.id}
                    className={cx('thread-item', activeId === thread.id && 'active', thread.unreadCount > 0 && 'unread')}
                    onClick={() => selectThread(thread.id)}
                    type="button"
                  >
                    {isAdmin ? (
                      <span className="thread-avatars">
                        {thread.participants.map((participant) => (
                          <Avatar key={participant.id} person={participant} size={30} />
                        ))}
                      </span>
                    ) : (
                      <Avatar person={person} size={38} />
                    )}
                    <span className="thread-item-body">
                      <span className="thread-item-top">
                        <strong>{threadTitle(thread, user)}</strong>
                        <em>{relativeTime(thread.updatedAt)}</em>
                      </span>
                      <span className="thread-subject">{thread.subject}</span>
                      <span className="thread-preview">
                        {thread.lastMessage ? (
                          <>
                            {thread.lastMessage.senderId === user.id ? 'You: ' : ''}
                            {thread.lastMessage.body}
                          </>
                        ) : (
                          'No messages yet'
                        )}
                      </span>
                      <span className="thread-item-foot">
                        {thread.course && <Badge tone="cyan">{thread.course.code}</Badge>}
                        {thread.unreadCount > 0 && <em className="unread-pill">{thread.unreadCount} new</em>}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section className="conversation">
          {!activeId ? (
            <div className="conversation-empty">
              <span className="conversation-orbit">
                <Icon name="message" size={30} />
              </span>
              <h2>Pick a thread to open the room</h2>
              <p>
                {isAdmin
                  ? 'Every conversation on campus appears on the left. Open one to review the context or respond as a moderator.'
                  : 'Course-scoped questions, feedback and follow-ups — all in one place.'}
              </p>
              <button className="btn btn-ghost btn-sm" onClick={openNew} type="button">
                <Icon name="plus" size={15} /> Start a new conversation
              </button>
            </div>
          ) : activeThread?.id !== activeId ? (
            threadError ? (
              <ErrorState
                error={threadError}
                onRetry={() => setThreadReloadKey((key) => key + 1)}
              />
            ) : (
              <div className="grid-loading">
                <Spinner size={20} /> Opening the thread…
              </div>
            )
          ) : (
            <>
              <header className="conversation-head">
                <div className="conversation-people">
                  {isAdmin ? (
                    <span className="thread-avatars">
                      {activeThread.participants.map((participant) => (
                        <Avatar key={participant.id} person={participant} size={38} />
                      ))}
                    </span>
                  ) : (
                    <Avatar person={other} size={42} />
                  )}
                  <div>
                    <h2>{activeThread.subject}</h2>
                    <p>
                      {isAdmin
                        ? activeThread.participants.map((person) => `${person.name} (${roleLabel[person.role]})`).join(' · ')
                        : `${other?.name} · ${roleLabel[other?.role] || 'Teacher'}`}
                      {!isAdmin && other?.role === 'teacher' && ' · your teacher'}
                    </p>
                  </div>
                </div>
                <div className="conversation-tags">
                  {activeThread.course && (
                    <Link to={`/app/courses/${activeThread.course.id}`}>
                      <Badge tone="cyan">{activeThread.course.code}</Badge>
                    </Link>
                  )}
                  {isAdmin && <Badge tone="amber" dot>Moderating</Badge>}
                  <Badge tone="muted">{activeThread.messageCount} messages</Badge>
                </div>
              </header>

              <div className="message-scroll" ref={scrollRef}>
                {messages.map((message, index) => {
                  const mine = message.sender?.id === user.id
                  const previous = messages[index - 1]
                  const showDay =
                    !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt)
                  return (
                    <Fragment key={message.id}>
                      {showDay && <div className="day-divider">{dayLabel(message.createdAt)}</div>}
                      <div className={cx('bubble-row', mine && 'mine')}>
                        {!mine && <Avatar person={message.sender} size={30} />}
                        <div className={cx('bubble', mine && 'mine')}>
                          {!mine && (
                            <span className="bubble-name">
                              {message.sender?.name}
                              {message.sender?.role === 'admin' && <em> · moderator</em>}
                            </span>
                          )}
                          <p>{message.body}</p>
                          <em className="bubble-time">{formatTime(message.createdAt)}</em>
                        </div>
                      </div>
                    </Fragment>
                  )
                })}
              </div>

              <form className="composer" onSubmit={sendReply}>
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder={`Reply to ${isAdmin ? 'the thread' : other?.name?.split(' ')[0] || 'this thread'}…`}
                  rows={2}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      sendReply(event)
                    }
                  }}
                />
                <div className="composer-foot">
                  <span>
                    <Icon name="lock" size={12} /> Only the people in this thread and campus admin can read it.
                  </span>
                  <button className="btn btn-primary btn-sm" disabled={sending || !reply.trim()} type="submit">
                    {sending ? <Spinner size={14} /> : <Icon name="send" size={14} />}
                    Send
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      <Modal
        open={composeOpen}
        onClose={closeCompose}
        title="New conversation"
        description={
          user.role === 'student'
            ? 'Your teacher will see the course this question belongs to.'
            : user.role === 'teacher'
              ? 'Choose a student from one of your courses.'
              : 'Open a moderation or support thread with anyone on campus.'
        }
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={closeCompose} type="button">
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={createThread}
              disabled={creating || !compose.recipientId || !compose.subject.trim() || !compose.body.trim()}
              type="button"
            >
              {creating ? <Spinner size={14} /> : <Icon name="send" size={14} />} Start thread
            </button>
          </>
        }
      >
        <form className="compose-form" onSubmit={createThread}>
          <label className="field">
            <span>{user.role === 'student' ? 'Teacher' : user.role === 'teacher' ? 'Student' : 'Person'}</span>
            <select
              value={compose.recipientId}
              onChange={(event) =>
                setCompose((current) => ({
                  ...current,
                  recipientId: event.target.value,
                  courseId: '',
                }))
              }
              required
            >
              <option value="">Choose someone…</option>
              {contacts.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {roleLabel[person.role]}
                  {person.courses?.length ? ` (${person.courses.length} shared)` : ''}
                </option>
              ))}
            </select>
          </label>

          {contactCourses.length > 0 && (
            <label className="field">
              <span>Link a course (optional)</span>
              <select
                value={compose.courseId}
                onChange={(event) => setCompose((current) => ({ ...current, courseId: event.target.value }))}
              >
                <option value="">No specific course</option>
                {contactCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} · {course.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>Subject</span>
            <input
              value={compose.subject}
              onChange={(event) => setCompose((current) => ({ ...current, subject: event.target.value }))}
              placeholder="What do you need help with?"
              maxLength={140}
              required
            />
          </label>

          <label className="field">
            <span>First message</span>
            <textarea
              rows={5}
              value={compose.body}
              onChange={(event) => setCompose((current) => ({ ...current, body: event.target.value }))}
              placeholder="Give a little context so the reply can be useful…"
              required
            />
          </label>
        </form>
      </Modal>
    </div>
  )
}
