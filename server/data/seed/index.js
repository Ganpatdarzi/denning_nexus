import { users, demoPassword } from './users.js'
import { fields, courses } from './catalog.js'
import { enrollments } from './enrollments.js'
import { threads, messages } from './conversations.js'
import { notifications } from './signals.js'
import { activity } from './activity.js'
import { assignments, submissions } from './assignments.js'
import { teacherApplications } from './teacherApplications.js'

/**
 * The entire seed lives in memory-shaped collections. Swapping this module for
 * SQL/Mongo repositories later only requires keeping these collection names.
 */
export function buildSeed() {
  return {
    meta: {
      version: 1,
      seededAt: new Date().toISOString(),
      demoPassword,
    },
    users,
    fields,
    courses,
    enrollments,
    threads,
    messages,
    notifications,
    activity,
    assignments,
    submissions,
    audits: [],
    teacherApplications,
  }
}
