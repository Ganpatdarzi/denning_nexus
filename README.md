# Denning Nexus

A full-stack campus network that connects **students, teachers, and administrators** around fields, courses, learning outcomes, assignments, and conversations.

Students discover a field, enrol in courses, track outcomes, submit assignments, and message their teachers. Teachers apply to join, publish courses, monitor their roster, audit submissions with AI, and answer students. Admins verify faculty documents, approve accounts, moderate threads, watch campus activity, and broadcast updates.

> Application data can stay in a JSON file for zero-infrastructure development, or live in **Supabase Postgres** through the same store by setting `DB_DRIVER=supabase`. Files can live in private Supabase Storage and AI checks run through Gemini. The Postgres driver stores the current JSON-shaped state as one JSONB document, avoiding a big-bang rewrite — see [Supabase Postgres setup](#supabase-postgres-setup).

---

## Features

### Students
- Browse **five fields** and filter courses by field, level, and search.
- Open a course to see its teacher, outcomes, seats, and enrolled peers.
- Enrol or leave a course; tick off learning outcomes as they are achieved.
- A course is marked **completed automatically at 100% outcome progress**.
- Submit assignments by uploading a file or pasting text/code; resubmit after feedback.
- See AI audit feedback and the teacher's final decision on each submission.
- Personalised dashboard with active courses, progress, and recent conversations.
- Message any active teacher, optionally linking the course the question belongs to.

### Teachers
- Apply to teach with a private verification document; the account stays **pending** until an administrator approves it.
- While pending, sign in to a focused **application page**: upload documents, watch the AI check, read admin notes, and upload replacements.
- Teacher studio: create and edit courses, publish/unpublish, set seats, outcomes, and schedule.
- Create assignments with rubrics, due dates, and attachment requirements.
- Run **AI preflight** on an assignment, review submissions, trigger AI audits, and record a final decision.
- See roster progress per student, outcome completion, and course averages.
- Message students directly from the roster.
- Reply in course-scoped threads; unread counts surface on the dashboard and bell.

### Administrators
- **Teacher verification queue** with AI verdicts, extracted document fields, checks, red flags, and private document previews.
- Approve, reject, or request more documents. Approving activates the teacher account.
- An AI denial is shown explicitly as **“Denied by AI”**; an administrator can still override it, and the override is recorded.
- Approve pending teachers, suspend or reactivate accounts; approvals stay in sync with verification records.
- Read and reply to **every student–teacher thread** as a moderator.
- Campus stats: users, courses, enrolments, outcomes achieved, conversations, and last-7-day message volume.
- Live activity feed aggregated from student, teacher, and admin actions.
- Send broadcast notifications to everyone, students only, or teachers only.
- Oversee assignment audits and teacher decisions from the AI audit workspace.

### AI and storage
- **Gemini assignment auditing**: rubric checks, strengths, improvements, and a recommended decision.
- **Gemini teacher-document verification**: reads an ID, licence, degree, or qualification and returns `AI_APPROVED`, `AI_NEEDS_REVIEW`, or `AI_DENIED`.
- Gemini is optional. Without `GEMINI_API_KEY`:
  - assignment audits use a transparent local rubric for text/code;
  - teacher verification falls back to `AI_NEEDS_REVIEW` and is **never auto-denied**.
- **Supabase Storage** with separate private buckets for `assignments` and `teacher-verifications`.
- The service role key is server-only; admins preview documents through five-minute signed URLs, with an authenticated raw-file fallback for local development.
- JWT auth, bcrypt password hashing, role-based route protection, rate-limited login.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 6, React Router 6, custom CSS |
| Backend | Node.js 18+, Express 4, ESM |
| Auth | JSON Web Tokens, bcryptjs |
| AI | `@google/genai` with Gemini (`gemini-2.5-flash` by default) |
| File storage | Local disk or private Supabase Storage |
| Persistence (current) | JSON file or Supabase Postgres (`app_state` JSONB document) |
| Persistence (planned) | Normalized PostgreSQL tables behind the same repository surface |

---

## Quick start

**Requirements:** Node.js 18+ and npm.

```bash
# from the repository root
npm run install:all
cp server/.env.example server/.env   # Windows: copy server\.env.example server\.env
npm run dev
```

Open **http://localhost:5173**.

The app runs without any credentials:

- assignment audits use the local rubric;
- teacher document checks are queued for a human (`AI_NEEDS_REVIEW`);
- uploads go to `server/data/uploads`.

To enable Gemini and Supabase Storage, fill in `server/.env` (see [Configuration](#configuration) and [Supabase Storage setup](#supabase-storage-setup)).

Individual processes:

```bash
npm run dev:server    # Express API with node --watch
npm run dev:client    # Vite dev server
```

Production-style run (one Node process serves API + built SPA):

```bash
npm run build
NODE_ENV=production npm start
# then open http://localhost:4000
```

The Vite dev server proxies `/api` to `http://localhost:4000`, so the client always uses relative `/api` paths.

---

## Demo accounts

All seeded accounts use the password **`Password123!`**.

| Role | Name | Email | Notes |
| --- | --- | --- | --- |
| Student | Priya Sharma | `priya@denning.edu` | Technology field, enrolled courses |
| Teacher | Dr. Aisha Rahman | `aisha@denning.edu` | Active, multiple published courses |
| Admin | Amara Osei | `admin@denning.edu` | Full moderation, verification, approvals |
| Teacher | Ravi Deshmukh | `ravi@denning.edu` | Pending; seeded application is **Denied by AI** |
| Teacher | Nadia Hassan | `nadia@denning.edu` | Pending; seeded application is **Needs human review** |
| Student | Jordan Vale | `jordan@denning.edu` | **Suspended** — sign-in is blocked |

Additional active teachers (`marcus@`, `lina@`, `sanjay@`, `elise@`) and students (`daniel@`, `meera@`, `tomas@`) share the same password.

The login screen fetches demo accounts from the public `GET /api/auth/demo-accounts` endpoint and can fill the form with one click.

> Demo credentials are intentionally public. Change or remove them before exposing a real deployment.

---

## Teacher verification flow

1. **Register as a teacher.** The account is created with `status: pending`; the API returns a limited session.
2. **Sign in.** Pending teachers are redirected to `/apply`, not the main campus.
3. **Upload one document** (PDF/PNG/JPG/WEBP, up to `MAX_UPLOAD_MB`). The file is stored privately and the AI runs immediately.
4. **AI verdict.**
   - `AI_APPROVED` → queued for admin approval.
   - `AI_NEEDS_REVIEW` → queued for a human.
   - `AI_DENIED` → application status `rejected_by_ai`, still visible to admins, not auto-deleted.
5. **Admin review.** `/app/admin/verifications` shows the AI verdict, confidence, extracted fields, checks, reasons, red flags, and a signed-URL document preview.
6. **Decision.**
   - **Approve** → teacher account becomes active.
   - **Request more documents** → teacher uploads again; the AI reruns.
   - **Reject** → application closes; the teacher may reapply.

Previous AI verdicts and admin decisions are preserved in `aiHistory` and `decisionHistory` when an application is resubmitted. The application record is reused so the audit trail stays intact.

### Pending-teacher access

Pending teachers can only reach:

- `GET /api/auth/me`
- `GET /api/teacher-applications/me`
- `GET /api/teacher-applications/meta`
- `POST /api/teacher-applications`

Every other API route still requires an active account. Suspended accounts remain blocked.

---

## Roles and permissions

| Capability | Student | Teacher | Admin |
| --- | :---: | :---: | :---: |
| Browse fields, courses, teachers | ✅ | ✅ | ✅ |
| Enrol and track outcomes | ✅ | — | — |
| Submit assignments and see AI feedback | ✅ | — | — |
| Create/manage own courses and assignments | — | ✅ | ✅ |
| Run AI audits and record final decisions | — | ✅ | ✅ |
| Message a teacher/student | ✅ | ✅ (own students) | ✅ (anyone) |
| Read all campus threads | — | — | ✅ |
| Review teacher documents and AI verdicts | — | — | ✅ |
| Approve/suspend users | — | — | ✅ |
| Campus stats and broadcasts | — | — | ✅ |

Rules enforced by the API:
- Students may only open threads with **active teachers**.
- If a student links a course, the course must belong to the chosen teacher.
- Teachers may only start threads with students enrolled in their courses.
- Pending teachers get a limited session for verification only; suspended accounts are rejected at login and blocked by auth middleware.
- Admins cannot change their own status, and admin accounts cannot be suspended through the UI.
- A teacher approval from People & access synchronizes the latest verification application to `approved`.
- The AI is advisory. Every admin decision records the administrator, timestamp, and note.

---

## Project structure

```
Denning/
├── package.json              # root scripts (dev, build, reset:db, start)
├── scripts/dev.js            # runs API + client with prefixed output
├── server/
│   ├── data/
│   │   ├── db.json           # local cache / JSON database (gitignored)
│   │   ├── uploads/          # local storage fallback (gitignored)
│   │   └── seed/             # users, catalog, assignments, teacher applications
│   ├── db/
│   │   └── supabase.sql      # one-time app_state table migration
│   └── src/
│       ├── index.js          # HTTP bootstrap
│       ├── app.js            # Express app, API routes, production SPA serving
│       ├── config.js         # environment configuration
│       ├── db/store.js       # JSON + Supabase Postgres persistence, ids, cache
│       ├── middleware/       # auth, pending-auth, upload validation
│       ├── routes/           # auth, catalog, me, messages, notifications,
│       │                     # assignments, teacherVerifications, admin
│       ├── services/         # Gemini agents, storage, notifications, activity
│       └── utils/http.js     # async wrapper and HTTP errors
└── client/
    ├── vite.config.js        # dev port + /api proxy
    └── src/
        ├── App.jsx           # public, auth, pending-teacher, protected routes
        ├── components/       # shell, cards, icons, modal/toast, verification UI
        ├── context/          # auth/session context
        ├── lib/              # API client and formatters
        ├── pages/            # landing, auth, apply, dashboard, courses,
        │                     # assignments, messages, admin + verification
        └── styles/           # base tokens/primitives + page styles
```

---

## API reference

Base URL: `http://localhost:4000/api`. Protected routes expect `Authorization: Bearer <token>`.

### Auth
| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | Service health |
| GET | `/auth/demo-accounts` | Public | Seed demo users shown on login |
| POST | `/auth/register` | Public | Create a student or pending teacher (limited token returned for teachers) |
| POST | `/auth/login` | Public | Exchange credentials for a JWT |
| GET | `/auth/me` | Active or pending | Current user session |

### Catalog
| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/fields` | Public | Learning fields |
| GET | `/courses` | Public | Filterable course list |
| GET | `/courses/:id` | Public | Course detail and outcomes |
| POST | `/courses` | Teacher/Admin | Create a course |
| PATCH | `/courses/:id` | Owner/Admin | Update a course |
| GET | `/courses/:id/roster` | Owner/Admin | Student progress roster |
| GET | `/teachers` | Public | Teacher directory |
| GET | `/teachers/:id` | Public | Teacher profile |

### Student workspace
| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/me/dashboard` | Auth | Role-aware dashboard payload |
| POST | `/me/enrollments` | Student | Enrol in a course |
| DELETE | `/me/enrollments/:courseId` | Student | Leave a course |
| PATCH | `/me/enrollments/:courseId/outcomes` | Student | Toggle achieved outcomes |
| GET | `/me/teaching` | Teacher | Studio overview |
| GET | `/me/contacts` | Auth | Valid people to message |
| PATCH | `/me/profile` | Auth | Update profile fields |

### Assignments and AI audits
| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/assignments/meta` | Auth | AI/storage/upload capabilities |
| GET | `/assignments` | Auth | Assignments visible to the viewer |
| POST | `/assignments` | Teacher/Admin | Create an assignment |
| GET | `/assignments/:id` | Auth | Assignment detail |
| PATCH | `/assignments/:id` | Owner/Admin | Update an assignment |
| POST | `/assignments/:id/preflight` | Owner/Admin | Check rubric/instructions with AI before publishing |
| GET | `/assignments/:id/submissions` | Owner/Admin | Submissions for review |
| POST | `/assignments/:id/submissions` | Student | Upload or paste a submission |
| GET | `/submissions/:id` | Owner/Admin/Student | Submission and audit history |
| GET | `/submissions/:id/file` | Authorized | Download/stream the submitted file |
| POST | `/submissions/:id/audit` | Owner/Admin | Run or rerun an AI audit |
| PATCH | `/submissions/:id/decision` | Owner/Admin | Record the teacher's final decision |

### Teacher verification
| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/teacher-applications/me` | Pending/active teacher | Latest application, AI verdict, history |
| GET | `/teacher-applications/meta` | Pending/active teacher | AI/storage/upload capabilities |
| POST | `/teacher-applications` | Pending/active teacher | Upload/replace a document and run AI |
| GET | `/admin/teacher-verifications` | Admin | Verification queue, counts, storage/AI metadata |
| GET | `/admin/teacher-verifications/:id/file/:docId` | Admin | Short-lived signed URL for private preview |
| GET | `/admin/teacher-verifications/:id/file/:docId/raw` | Admin | Authenticated file fallback (local storage) |
| PATCH | `/admin/teacher-verifications/:id/decision` | Admin | `approve`, `reject`, or `request_more` |

`POST /teacher-applications` is `multipart/form-data` with a single `document` field.

### Messaging
| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/threads` | Auth | Threads visible to the viewer |
| POST | `/threads` | Auth | Create a thread with a first message |
| GET | `/threads/:id` | Participant/Admin | Thread plus messages |
| POST | `/threads/:id/messages` | Participant/Admin | Reply |
| PATCH | `/threads/:id/read` | Participant/Admin | Mark thread read |

### Notifications
| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/notifications` | Auth | Notification list |
| GET | `/notifications/unread-count` | Auth | Badge count |
| PATCH | `/notifications/:id/read` | Auth | Mark one read |
| POST | `/notifications/read-all` | Auth | Mark all read |

### Administration
| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/admin/stats` | Admin | Campus overview |
| GET | `/admin/users` | Admin | Search/filter all users |
| PATCH | `/admin/users/:id/status` | Admin | Approve, suspend, reactivate |
| GET | `/admin/activity` | Admin | Filterable activity feed |
| POST | `/admin/broadcast` | Admin | Notify an audience |

---

## Data model

The seed mirrors the collections a relational or document database would use:

| Collection | Key fields |
| --- | --- |
| `users` | `id`, `role`, `name`, `email`, `passwordHash`, `status`, `fieldSlug`, profile fields |
| `fields` | `id`, `slug`, `name`, `tagline`, `description`, `icon`, `accent` |
| `courses` | `id`, `code`, `title`, `fieldSlug`, `teacherId`, `level`, `published`, `seats`, `outcomes[]` |
| `enrollments` | `id`, `courseId`, `studentId`, `doneOutcomeIds[]`, `status`, timestamps |
| `assignments` | `id`, `courseId`, `teacherId`, `title`, `instructions`, `rubric[]`, `dueAt`, `published` |
| `submissions` | `id`, `assignmentId`, `studentId`, `file`, `text`, `status`, `audits[]`, teacher decision |
| `audits` | AI audit history: verdict, rubric checks, feedback, provider/model, timestamps |
| `teacherApplications` | `id`, `userId`, `status`, `documents[]`, `aiVerdict`, `aiHistory[]`, `adminDecision`, `decisionHistory[]` |
| `threads` | `id`, `subject`, `courseId`, `participantIds[]`, `reads`, `status`, timestamps |
| `messages` | `id`, `threadId`, `senderId`, `body`, `createdAt` |
| `notifications` | `id`, `userId`, `type`, `title`, `body`, `link`, `read`, `createdAt` |
| `activity` | `id`, `type`, `actorId`, `summary`, `targetType`, `targetId`, `createdAt` |

The JSON store loads once into memory and writes atomically to `server/data/db.json`. If the file is missing, `buildSeed()` creates a complete demo campus. Older data files are migrated in place by adding missing collections. This is single-process development storage only.

Teacher application statuses:

`pending_ai_review` → `pending_admin_review` → `approved` / `rejected` / `needs_more_documents`

An AI denial sets `rejected_by_ai`; administrators can still approve, reject, or request more.

---

## Configuration

Create `server/.env` (see `server/.env.example`). All values are optional in development.

```dotenv
PORT=4000
NODE_ENV=development
JWT_SECRET=replace-with-a-long-random-secret
JWT_TTL=7d
CLIENT_ORIGIN=http://localhost:5173
# DATA_FILE=./data/db.json

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_MS=90000

MAX_UPLOAD_MB=10
# UPLOAD_DIR=./data/uploads

# Application data: json | supabase
DB_DRIVER=json
SUPABASE_STATE_TABLE=app_state

STORAGE_DRIVER=local
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_BUCKET=denning-submissions
SUPABASE_BUCKET_ASSIGNMENTS=assignments
SUPABASE_BUCKET_TEACHER_DOCS=teacher-verifications
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `NODE_ENV` | — | `production` enables production errors and SPA serving |
| `JWT_SECRET` | dev fallback | **Change for any shared or production deployment** |
| `JWT_TTL` | `7d` | Token lifetime |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Primary CORS origin (set to the public URL) |
| `DATA_FILE` | `server/data/db.json` | JSON database location |
| `GEMINI_API_KEY` | — | Enables Gemini auditing/verification |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model |
| `GEMINI_TIMEOUT_MS` | `90000` | Per-request AI timeout |
| `MAX_UPLOAD_MB` | `10` | Upload limit |
| `UPLOAD_DIR` | `server/data/uploads` | Local storage directory |
| `DB_DRIVER` | `json` | `json` or `supabase` for application data |
| `SUPABASE_STATE_TABLE` | `app_state` | Table used by the Supabase data driver |
| `STORAGE_DRIVER` | `local` | `local` or `supabase` |
| `SUPABASE_URL` | — | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **Server only.** Never expose in client code |
| `SUPABASE_BUCKET` | `denning-submissions` | Legacy/default bucket |
| `SUPABASE_BUCKET_ASSIGNMENTS` | `assignments` | Private assignment bucket |
| `SUPABASE_BUCKET_TEACHER_DOCS` | `teacher-verifications` | Private verification bucket |

---

## Supabase Postgres setup

This uses the Supabase REST API and the existing server-only service role key; **no database password or connection string is required**.

1. Open **Supabase → SQL Editor** and run [`server/db/supabase.sql`](server/db/supabase.sql). It creates the private `app_state` table and grants access only to the service role.
2. Add the driver settings to `server/.env`:

```dotenv
DB_DRIVER=supabase
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
SUPABASE_STATE_TABLE=app_state
```

3. Restart the API. The startup log should show:

```text
[db] loaded application data from Supabase Postgres
Database driver: supabase (app_state)
```

On the first start with an empty table, the API copies the current local state (or the seed) into Supabase. The JSON file remains a local cache and fallback, while Supabase is loaded at startup. Writes are serialized and flushed to Supabase; the process also flushes on shutdown.

`npm run reset:db` reseeds the configured driver. With `DB_DRIVER=supabase`, this **overwrites the remote `app_state` row**, so use it only for demo data.

Only one API instance should write to the JSONB document at a time. Normalized tables and transactions are still the recommended next step for high-volume production.

---

## Supabase Storage setup

1. Create a Supabase project.
2. In **Storage**, create two **private** buckets:
   - `assignments`
   - `teacher-verifications`
3. Copy the project URL and the **service role** key into `server/.env`:

```dotenv
STORAGE_DRIVER=supabase
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
SUPABASE_BUCKET_ASSIGNMENTS=assignments
SUPABASE_BUCKET_TEACHER_DOCS=teacher-verifications
```

4. Restart the API. `GET /api/assignments/meta` should report `storage.driver: "supabase"`.

The browser never receives the service role key. Admins request a five-minute signed URL from `GET /api/admin/teacher-verifications/:id/file/:docId`; in local mode the API streams the file through an authenticated admin endpoint instead.

**Rotate the service role key immediately if it has ever been committed, pasted into a browser, or shared in a chat.**

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run API and client together |
| `npm run dev:server` | API only (watch mode) |
| `npm run dev:client` | Client only |
| `npm run install:all` | Install both workspaces |
| `npm run build` | Build the client into `client/dist` |
| `npm start` | Start the API without watch |
| `npm run reset:db` | Delete and reseed the configured data store (`json` or Supabase) |

> After `reset:db`, restart the API so the in-memory copy is rebuilt from the fresh store. With `DB_DRIVER=supabase`, reset overwrites the remote `app_state` row.

---

## Deployment

### Can it be deployed now?

**Yes — multiple ways are supported:**

#### Option 1: Vercel (full-stack, single project) — Recommended
Deploy everything to [Vercel](https://vercel.com/) with [Supabase](https://supabase.com/) for the database and file storage.

1. **Set up Supabase**
   - Create a project, run [`server/db/supabase.sql`](server/db/supabase.sql) in the SQL Editor to create the `app_state` table (RLS locked to the service role).
   - Create two private storage buckets: `assignments` and `teacher-verifications`.
   - Copy your Project URL and `service_role` key from `Project Settings > API`.

2. **Deploy to Vercel**
   - Import `Ganpatdarzi/denning_nexus` to Vercel. The repo includes `vercel.json` and `api/index.js` to run the Express API as serverless functions alongside the Vite build.
   - Add environment variables (Production):
     | Key | Value |
     | --- | --- |
     | `NODE_ENV` | `production` |
     | `JWT_SECRET` | A long random string |
     | `CLIENT_ORIGIN` | `https://your-project-name.vercel.app` |
     | `DB_DRIVER` | `supabase` |
     | `SUPABASE_URL` | Your Supabase project URL |
     | `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service_role key |
     | `SUPABASE_STATE_TABLE` | `app_state` |
     | `STORAGE_DRIVER` | `supabase` |
     | `SUPABASE_BUCKET_ASSIGNMENTS` | `assignments` |
     | `SUPABASE_BUCKET_TEACHER_DOCS` | `teacher-verifications` |
     | `GEMINI_API_KEY` | (optional) — leave blank for local rubric/manual review fallback |

3. **Finalize**
   - After first deploy, copy the live Vercel URL and set/update `CLIENT_ORIGIN` to it, then redeploy.
   - Visit `https://your-project-name.vercel.app/api/health` to confirm the API is running.
   - The frontend calls relative `/api/*` paths, so no `VITE_API_URL` is needed for a single-domain Vercel deploy.

> Note: On Vercel serverless, the filesystem is ephemeral. Use `DB_DRIVER=supabase` and `STORAGE_DRIVER=supabase` for persistence. With `json` + `local` storage, data will reset between cold starts/deploys.

#### Option 2: Single Node process (Render, Railway, Fly.io, VPS)
```bash
npm run install:all
npm run build
NODE_ENV=production JWT_SECRET="<long-random-secret>" npm start
```
The Express server serves both `/api` and the built SPA from `client/dist`. For persistence use a mounted disk with `DB_DRIVER=json` or `DB_DRIVER=supabase` with Supabase Storage.

For anything involving real student data or horizontal scaling, finish the persistence migration first. Current blockers:

- **JSON persistence is single-process and filesystem-bound.** With `DB_DRIVER=json` it is not safe for multiple instances and can be lost on hosts with ephemeral disks. `DB_DRIVER=supabase` removes the disk dependency but still uses one document row, so keep one API writer.
- **Seeded demo credentials are public.** The admin password is in the seed and login screen. Replace or remove demo accounts before a public launch.
- **AI and storage credentials are optional.** Production should set `GEMINI_API_KEY` and Supabase Storage.
- **No durable queue/retry worker.** AI calls happen in the request path; a timeout falls back safely but can slow uploads.

### Recommended production shape

| Piece | Recommendation |
| --- | --- |
| Runtime (all-in-one) | **Vercel** (with `api/index.js` + `vercel.json`) using Supabase for DB/storage, or Render/Railway/Fly.io/VM with a **persistent disk** |
| Runtime (split) | Vercel/Netlify for the client, Render/Koyeb/Railway for the API |
| Build | `npm run build` in the deploy step (Vercel handles this automatically from `vercel.json`) |
| Start | `NODE_ENV=production npm start` for a Node server; Vercel uses the serverless function wrapper for API routes |
| Database | `DB_DRIVER=supabase` for durable data on serverless/ephemeral hosts; JSON remains the zero-config default for local/single-disk hosts |
| Files | `STORAGE_DRIVER=supabase` with private buckets (`assignments`, `teacher-verifications`) |
| Secrets | `JWT_SECRET`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in the host's secret manager |
| TLS | Terminate HTTPS at the platform/proxy; `trust proxy` is enabled in production |
| Origin | Set `CLIENT_ORIGIN` to the public URL (must match your deployed frontend/domain) |
| AI | Set `GEMINI_API_KEY`; leave it unset to run in manual-review mode |
| Admin | Change/remove the seeded admin password before exposing the app |

If you deploy the client separately (Vercel/Netlify), configure a rewrite/proxy so `/api/*` reaches the Express service. The client intentionally uses relative `/api` paths in dev and can use `VITE_API_URL` for a cross-origin split deploy, while a same-origin Vercel deploy works without it.

### Docker

A two-stage `Dockerfile` builds the SPA and runs one production Node service:

```bash
docker build -t denning-nexus .
docker run -p 4000:4000 --env-file server/.env \
  -e DATA_FILE=/data/db.json \
  -v denning-data:/data \
  denning-nexus
```

Mount `/data` (not `/app/server/data`) so the separate database volume does not hide the seed modules. When using Supabase Storage, file uploads do not need a second volume.

### Production checklist

- [ ] `JWT_SECRET` is long, random, and not the dev fallback.
- [ ] `NODE_ENV=production`.
- [ ] `CLIENT_ORIGIN` is the real HTTPS origin (e.g. your Vercel domain).
- [ ] If deploying to Vercel/serverless, use `DB_DRIVER=supabase` and `STORAGE_DRIVER=supabase` (filesystem is ephemeral).
- [ ] `DATA_FILE` points at a persistent volume **outside** the deploy directory if using `DB_DRIVER=json` on a VM/container.
- [ ] `db.json` is backed up, or Supabase Postgres is enabled and `app_state` is reachable.
- [ ] Supabase buckets (`assignments`, `teacher-verifications`) are private and `SUPABASE_SERVICE_ROLE_KEY` is server-only (never exposed to the client).
- [ ] `GEMINI_API_KEY` is set, or manual-review mode is acceptable.
- [ ] Seeded demo users/admin credentials are removed or rotated.
- [ ] One API instance only while the document store is in use (or use Supabase with care).
- [ ] Health check: `GET /api/health` returns `{ "ok": true }`.

---

## Troubleshooting

- **`Port 4000 is already in use`** — stop the other API process, or set `PORT` in `server/.env` and update `client/vite.config.js` to proxy to the same port.
- **Blank or stale UI after data changes** — hard-refresh the browser; some catalog data is fetched on route load.
- **`Cannot reach the campus server`** — confirm `GET http://localhost:4000/api/health` returns `{ "ok": true }`.
- **Lost demo data** — run `npm run reset:db` and restart the API.
- **Teacher cannot reach the campus** — new teacher accounts are `pending`; they are routed to `/apply` until an administrator approves the verification application.
- **AI verdict is “Needs human review”** — `GEMINI_API_KEY` is missing or the AI call failed. This is the safe fallback, not an error that blocks admins.
- **Document preview is blank** — Supabase signed URLs expire after five minutes; reopen the preview. In local mode confirm `UPLOAD_DIR` still contains the file.
- **Supabase upload fails** — confirm both buckets exist and are private, the service role key is valid, and the server was restarted after editing `.env`.

---

## Database roadmap

The routes share one narrow data surface: `getDb()`, `save()`, `nextId()`, `userById()`, and `findUser()` in `server/src/db/store.js`. The optional `DB_DRIVER=supabase` path stores the current state in a single JSONB document, so it can be enabled without touching UI behaviour.

1. **Replace the document store with repositories.** Move each collection behind async functions (`users.findByEmail`, `courses.list`, `enrollments.forStudent`, `threads.forParticipant`, …) so routes stop touching arrays directly.
2. **Choose PostgreSQL.** Recommended tables mirror the collections above with foreign keys:
   - `users.email` unique; `courses.code` unique; `enrollments(student_id, course_id)` unique.
   - `threads` + `thread_participants` + `messages`; `thread_reads(thread_id, user_id, read_at)`.
   - `course_outcomes(course_id, position, text)` and `enrollment_outcomes(enrollment_id, outcome_id)`.
   - `assignments`, `submissions`, `audits` with indexes on `(assignment_id, student_id)` and `(teacher_id, created_at)`.
   - `teacher_applications` + `teacher_application_documents`; keep AI verdict and admin decision JSONB columns for the audit trail.
   - `notifications` and `activity` with indexes on `(user_id, read_at)` and `created_at`.
3. **Add migrations and transactions.** Use Prisma, Drizzle, Knex, or plain SQL migrations. Wrap enrolment + outcome updates, thread creation + first message, and teacher approval + account activation in transactions.
4. **Replace the store.** Keep the same exported functions (now async) backed by the database, and swap `buildSeed()` for an idempotent seed command.
5. **Harden operations.** Move `JWT_SECRET` to a secret manager, add connection pooling, pagination for threads/messages/admin lists, structured logging, and a durable job queue for AI audits.
6. **Optionally add realtime.** Replace 20–30 second polling with WebSockets or SSE once the database supports durable subscriptions.
7. **Add integration tests.** Exercise auth, enrolment/outcome completion, thread permissions, assignment upload/audit, teacher verification (including AI-denied override), suspension rules, and pending-account boundaries.

Keeping the current collection names and serializer shapes makes the frontend migration-free.
