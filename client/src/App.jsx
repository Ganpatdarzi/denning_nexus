import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { PageLoader } from './components/Ui.jsx'
import AppShell from './components/AppShell.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Explore from './pages/Explore.jsx'
import CourseDetail from './pages/CourseDetail.jsx'
import Teachers from './pages/Teachers.jsx'
import Messages from './pages/Messages.jsx'
import Notifications from './pages/Notifications.jsx'
import Profile from './pages/Profile.jsx'
import Teach from './pages/Teach.jsx'
import CourseForm from './pages/CourseForm.jsx'
import TeachCourse from './pages/TeachCourse.jsx'
import Admin from './pages/Admin.jsx'
import AdminUsers from './pages/AdminUsers.jsx'
import AdminVerifications from './pages/AdminVerifications.jsx'
import Assignments from './pages/Assignments.jsx'
import TeacherApplication from './pages/TeacherApplication.jsx'
import NotFound from './pages/NotFound.jsx'

export const homeFor = (role) =>
  role === 'admin' ? '/app/admin' : role === 'teacher' ? '/app/teach' : '/app'

function Protected({ children, roles }) {
  const { user, booting } = useAuth()
  const location = useLocation()

  if (booting) return <PageLoader label="Checking your campus pass…" />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  // A pending teacher can only see the verification workspace until an
  // administrator activates the account.
  if (user.status !== 'active') return <Navigate to="/apply" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return children
}

function RoleHome() {
  const { user } = useAuth()
  if (user.role === 'admin') return <Navigate to="/app/admin" replace />
  if (user.role === 'teacher') return <Navigate to="/app/teach" replace />
  return <Dashboard />
}

function GuestOnly({ children }) {
  const { user, booting } = useAuth()
  if (booting) return <PageLoader label="Opening your campus…" />
  if (user) return <Navigate to={homeFor(user.role)} replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/login"
        element={
          <GuestOnly>
            <Login />
          </GuestOnly>
        }
      />

      <Route path="/apply" element={<TeacherApplication />} />

      <Route
        path="/app"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<RoleHome />} />
        <Route path="explore" element={<Explore />} />
        <Route path="courses/:id" element={<CourseDetail />} />
        <Route path="assignments" element={<Assignments />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="messages" element={<Messages />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route
          path="teach"
          element={
            <Protected roles={['teacher', 'admin']}>
              <Teach />
            </Protected>
          }
        />
        <Route
          path="teach/courses/new"
          element={
            <Protected roles={['teacher', 'admin']}>
              <CourseForm mode="create" />
            </Protected>
          }
        />
        <Route
          path="teach/courses/:id"
          element={
            <Protected roles={['teacher', 'admin']}>
              <TeachCourse />
            </Protected>
          }
        />
        <Route
          path="admin"
          element={
            <Protected roles={['admin']}>
              <Admin />
            </Protected>
          }
        />
        <Route
          path="admin/users"
          element={
            <Protected roles={['admin']}>
              <AdminUsers />
            </Protected>
          }
        />
        <Route
          path="admin/verifications"
          element={
            <Protected roles={['admin']}>
              <AdminVerifications />
            </Protected>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
