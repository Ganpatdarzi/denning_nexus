import { getDb } from '../db/store.js'

export function teacherCard(user, db = getDb()) {
  if (!user) return null
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    accent: user.accent,
    headline: user.headline,
    bio: user.bio,
    expertise: user.expertise || [],
    officeHours: user.officeHours,
    rating: user.rating,
    fieldSlug: user.fieldSlug,
    courseCount: db.courses.filter((course) => course.teacherId === user.id).length,
    studentCount: new Set(
      db.enrollments
        .filter((enrollment) =>
          db.courses.some(
            (course) => course.id === enrollment.courseId && course.teacherId === user.id,
          ),
        )
        .map((enrollment) => enrollment.studentId),
    ).size,
  }
}

export function courseCard(course, db = getDb()) {
  const teacher = db.users.find((user) => user.id === course.teacherId)
  const field = db.fields.find((item) => item.slug === course.fieldSlug)
  const enrolledCount = db.enrollments.filter((e) => e.courseId === course.id).length
  return {
    ...course,
    outcomeCount: course.outcomes.length,
    enrolledCount,
    seatsLeft: Math.max(course.seats - enrolledCount, 0),
    teacher: teacherCard(teacher, db),
    field: field
      ? { slug: field.slug, name: field.name, accent: field.accent, icon: field.icon }
      : null,
  }
}

export function progressOf(enrollment, course) {
  const total = course?.outcomes.length || 0
  const done = enrollment.doneOutcomeIds.length
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
  }
}

export function threadView(thread, viewer, db = getDb()) {
  const participants = thread.participantIds
    .map((id) => db.users.find((user) => user.id === id))
    .filter(Boolean)
    .map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      accent: user.accent,
    }))
  const course = db.courses.find((item) => item.id === thread.courseId)
  const threadMessages = db.messages
    .filter((message) => message.threadId === thread.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const lastMessage = threadMessages.at(-1) || null
  const lastRead = new Date(thread.reads?.[viewer.id] || 0)
  const unreadCount = threadMessages.filter(
    (message) => message.senderId !== viewer.id && new Date(message.createdAt) > lastRead,
  ).length

  return {
    ...thread,
    participants,
    course: course ? { id: course.id, code: course.code, title: course.title } : null,
    lastMessage,
    messageCount: threadMessages.length,
    unreadCount,
    isModerator: viewer.role === 'admin',
  }
}

export function notificationView(notification) {
  return notification
}
