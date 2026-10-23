import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Icon from './Icon.jsx'
import { Avatar } from './Ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { cx, relativeTime, roleLabel } from '../lib/format.js'

const NAV = {
  student: [
    { to: '/app', label: 'My campus', icon: 'home', end: true },
    { to: '/app/assignments', label: 'Assignments', icon: 'cap' },
    { to: '/app/explore', label: 'Explore fields', icon: 'compass' },
    { to: '/app/teachers', label: 'Teachers', icon: 'users' },
    { to: '/app/messages', label: 'Messages', icon: 'message', badge: 'messages' },
    { to: '/app/notifications', label: 'Notifications', icon: 'bell' },
  ],
  teacher: [
    { to: '/app/teach', label: 'Teaching studio', icon: 'grid', end: true },
    { to: '/app/assignments', label: 'Assignments & AI', icon: 'target' },
    { to: '/app/explore', label: 'Course catalogue', icon: 'compass' },
    { to: '/app/teachers', label: 'Faculty', icon: 'users' },
    { to: '/app/messages', label: 'Messages', icon: 'message', badge: 'messages' },
    { to: '/app/notifications', label: 'Notifications', icon: 'bell' },
  ],
  admin: [
    { to: '/app/admin', label: 'Campus pulse', icon: 'chart', end: true },
    { to: '/app/admin/verifications', label: 'Teacher verification', icon: 'award' },
    { to: '/app/assignments', label: 'AI audits', icon: 'sparkles' },
    { to: '/app/admin/users', label: 'People & access', icon: 'shield' },
    { to: '/app/messages', label: 'All conversations', icon: 'message', badge: 'messages' },
    { to: '/app/explore', label: 'Catalogue', icon: 'compass' },
    { to: '/app/notifications', label: 'Notifications', icon: 'bell' },
  ],
}

const NOTIFICATION_ICONS = {
  message: 'message',
  enrollment: 'cap',
  outcome: 'target',
  approval: 'shield',
  course: 'book',
  broadcast: 'sparkles',
  system: 'bell',
  digest: 'chart',
  assignment: 'cap',
  submission: 'book',
  audit: 'sparkles',
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [navOpen, setNavOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const searchRef = useRef(null)
  const bellRef = useRef(null)

  const loadSignals = useCallback(async () => {
    try {
      const [notificationData, threadData] = await Promise.all([
        api.get('/notifications?limit=6'),
        api.get('/threads'),
      ])
      setNotifications(notificationData.notifications)
      setUnread(notificationData.unread)
      setUnreadMessages(threadData.unread)
    } catch {
      // Signal polling is best-effort; the rest of the app keeps working.
    }
  }, [])

  useEffect(() => {
    loadSignals()
    const timer = window.setInterval(loadSignals, 45_000)
    const onRefresh = () => loadSignals()
    window.addEventListener('nexus:signals', onRefresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('nexus:signals', onRefresh)
    }
  }, [loadSignals])

  useEffect(() => {
    setNavOpen(false)
    setBellOpen(false)
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  useEffect(() => {
    const onDown = (event) => {
      if (bellRef.current && !bellRef.current.contains(event.target)) setBellOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const openNotification = async (notification) => {
    setBellOpen(false)
    if (!notification.read) {
      try {
        await api.patch(`/notifications/${notification.id}/read`)
        setNotifications((current) =>
          current.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
        )
        setUnread((current) => Math.max(0, current - 1))
        window.dispatchEvent(new Event('nexus:signals'))
      } catch {
        // Navigating is more important than the read receipt.
      }
    }
    if (notification.link) navigate(notification.link)
  }

  const onSearch = (event) => {
    event.preventDefault()
    const value = searchRef.current?.value.trim()
    navigate(value ? `/app/explore?q=${encodeURIComponent(value)}` : '/app/explore')
  }

  const nav = NAV[user.role] || NAV.student
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="app-shell">
      <div className={cx('nav-scrim', navOpen && 'show')} onClick={() => setNavOpen(false)} />
      <aside className={cx('sidebar', navOpen && 'open')}>
        <Link to="/app" className="brand brand-app">
          <span className="brand-mark">
            <span />
          </span>
          <span className="brand-word">
            Denning<em>Nexus</em>
          </span>
        </Link>

        <div className="sidebar-role">
          <span className="pulse-dot" />
          {roleLabel[user.role]} workspace
        </div>

        <nav className="sidebar-nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cx('nav-link', isActive && 'active')}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.badge === 'messages' && unreadMessages > 0 && (
                <em className="nav-count">{unreadMessages}</em>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-quote">
          <Icon name="sparkles" size={16} />
          <p>{user.role === 'admin' ? 'Every signal on this campus reaches you here.' : 'Ask early. The best work starts with a question.'}</p>
        </div>

        <div className="sidebar-user">
          <Avatar person={user} size={38} />
          <div>
            <strong>{user.name}</strong>
            <span>{user.role === 'teacher' ? user.fieldSlug : user.year || roleLabel[user.role]}</span>
          </div>
          <button
            className="icon-btn"
            onClick={() => {
              logout()
              navigate('/')
            }}
            title="Sign out"
            type="button"
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setNavOpen((value) => !value)}
            aria-label="Toggle navigation"
            type="button"
          >
            <Icon name={navOpen ? 'x' : 'menu'} size={20} />
          </button>

          <form className="topbar-search" onSubmit={onSearch}>
            <Icon name="search" size={16} />
            <input ref={searchRef} placeholder="Search courses, teachers, outcomes…" aria-label="Search" />
            <kbd>↵</kbd>
          </form>

          <span className="topbar-date">{today}</span>

          <div className="topbar-actions">
            <Link to="/app/messages" className="icon-btn has-badge" title="Messages">
              <Icon name="message" size={18} />
              {unreadMessages > 0 && <span className="icon-count">{unreadMessages}</span>}
            </Link>

            <div className="bell-wrap" ref={bellRef}>
              <button
                className="icon-btn has-badge"
                onClick={() => setBellOpen((value) => !value)}
                aria-label="Notifications"
                type="button"
              >
                <Icon name="bell" size={18} />
                {unread > 0 && <span className="icon-count">{unread}</span>}
              </button>

              {bellOpen && (
                <div className="bell-panel">
                  <div className="bell-head">
                    <strong>Signals</strong>
                    <Link to="/app/notifications" onClick={() => setBellOpen(false)}>
                      See all <Icon name="arrow-right" size={13} />
                    </Link>
                  </div>
                  <div className="bell-list">
                    {notifications.length === 0 && <p className="bell-empty">Nothing new. A quiet campus.</p>}
                    {notifications.map((notification) => (
                      <button
                        key={notification.id}
                        className={cx('bell-item', !notification.read && 'unread')}
                        onClick={() => openNotification(notification)}
                        type="button"
                      >
                        <span className={cx('bell-icon', `tone-${notification.type}`)}>
                          <Icon name={NOTIFICATION_ICONS[notification.type] || 'bell'} size={15} />
                        </span>
                        <span className="bell-copy">
                          <strong>{notification.title}</strong>
                          <span>{notification.body}</span>
                          <em>{relativeTime(notification.createdAt)}</em>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Link to="/app/profile" className="topbar-user">
              <Avatar person={user} size={34} />
              <span>
                <strong>{user.name.split(' ')[0]}</strong>
                <em>{roleLabel[user.role]}</em>
              </span>
            </Link>
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
