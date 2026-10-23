import { minutesAgo } from './enrollments.js'

const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString()

export const assignments = [
  {
    id: 'a_fsjs_api',
    courseId: 'c_fsjs',
    teacherId: 'u_aisha',
    title: 'Campus Club API — Milestone 1',
    instructions: `Design and build the first working slice of a REST API for a campus club. Your submission must be one PDF, image, or text/code file.

Include a cover page with your full name, student ID and submission date. Explain the API design: at least four endpoints, the data each accepts and returns, and your validation rules. Include the working Express source code, then show testing evidence with at least three real request/response examples. Finish with a short reflection on one trade-off you made.

Cite any sources you used. You may discuss the approach with classmates, but the code and write-up must be your own. AI assistance is allowed for explanation and review only — do not submit generated work as your own.`,
    requiredSections: ['Cover page', 'API design', 'Implementation', 'Testing evidence', 'Reflection'],
    rubric: [
      {
        id: 'a_fsjs_api-r1',
        label: 'API design',
        description: 'Defines at least four purposeful REST endpoints with request/response shapes and validation rules.',
        weight: 25,
      },
      {
        id: 'a_fsjs_api-r2',
        label: 'Working implementation',
        description: 'Express source code is present, coherent, and would plausibly run. Routes are wired to data handling.',
        weight: 25,
      },
      {
        id: 'a_fsjs_api-r3',
        label: 'Testing evidence',
        description: 'Shows at least three real requests and responses, including one validation or error case.',
        weight: 20,
      },
      {
        id: 'a_fsjs_api-r4',
        label: 'Identity and format',
        description: 'Cover page contains the student name, student ID and date; required sections are easy to locate.',
        weight: 10,
      },
      {
        id: 'a_fsjs_api-r5',
        label: 'Reflection and clarity',
        description: 'Explains a real design trade-off and communicates decisions clearly to another developer.',
        weight: 20,
      },
    ],
    dueAt: inDays(5),
    published: true,
    createdAt: minutesAgo(60 * 24 * 7),
    updatedAt: minutesAgo(60 * 24 * 7),
    preflight: null,
  },
  {
    id: 'a_prog_cli',
    courseId: 'c_prog',
    teacherId: 'u_aisha',
    title: 'Personal Budget CLI',
    instructions: `Build a small command-line application that records expenses and prints a monthly summary.

Submit your source code plus a short README. Your README must include: a cover page with your name and student ID, setup and run instructions, a design explanation for your functions, and testing evidence showing at least three commands you ran. Add a reflection describing one bug you fixed.

Do not paste a full terminal transcript without commentary. Explain what each test proves. You may use documentation and ask classmates for feedback, but the implementation must be your own. Cite any external code you adapt.`,
    requiredSections: ['Cover page', 'Setup and run', 'Function design', 'Testing evidence', 'Reflection'],
    rubric: [
      {
        id: 'a_prog_cli-r1',
        label: 'Working CLI',
        description: 'The application has a clear entry point, accepts commands, and performs the described budget operations.',
        weight: 30,
      },
      {
        id: 'a_prog_cli-r2',
        label: 'Function design',
        description: 'Functions have clear responsibilities, inputs and outputs; error handling is explained.',
        weight: 20,
      },
      {
        id: 'a_prog_cli-r3',
        label: 'Testing evidence',
        description: 'At least three command runs are shown with expected outputs and commentary.',
        weight: 20,
      },
      {
        id: 'a_prog_cli-r4',
        label: 'README quality',
        description: 'A reader can install, run and understand the project without guessing.',
        weight: 20,
      },
      {
        id: 'a_prog_cli-r5',
        label: 'Reflection',
        description: 'Describes a specific bug or design decision and what changed as a result.',
        weight: 10,
      },
    ],
    dueAt: inDays(9),
    published: true,
    createdAt: minutesAgo(60 * 24 * 5),
    updatedAt: minutesAgo(60 * 24 * 5),
    preflight: null,
  },
  {
    id: 'a_prod_discovery',
    courseId: 'c_prod',
    teacherId: 'u_marcus',
    title: 'Discovery brief: a better commute',
    instructions: `Run three short discovery conversations about how students get to campus, then turn the evidence into a one-page product brief.

Submit a PDF or text file with: a cover page, the research question, a participant and method summary, five evidence-backed insights, an opportunity map, and one recommendation with explicit assumptions. Include a short note on what you would test next.

Anonymise participants. Do not fabricate quotes: label each insight with the kind of evidence behind it. Cite outside market data. AI may help you organise notes, but the interviews and synthesis must be yours.`,
    requiredSections: ['Cover page', 'Research question', 'Method', 'Insights', 'Opportunity map', 'Recommendation'],
    rubric: [
      {
        id: 'a_prod_discovery-r1',
        label: 'Research quality',
        description: 'Questions and method are appropriate; evidence is specific and not invented.',
        weight: 25,
      },
      {
        id: 'a_prod_discovery-r2',
        label: 'Evidence-backed insights',
        description: 'Five insights are traceable to interview evidence and avoid generic filler.',
        weight: 25,
      },
      {
        id: 'a_prod_discovery-r3',
        label: 'Opportunity map',
        description: 'Connects evidence to a defensible opportunity and says what not to build.',
        weight: 20,
      },
      {
        id: 'a_prod_discovery-r4',
        label: 'Recommendation and assumptions',
        description: 'Makes a clear recommendation and names the assumptions and next test.',
        weight: 20,
      },
      {
        id: 'a_prod_discovery-r5',
        label: 'Structure and ethics',
        description: 'Required sections are present, participants are anonymised, and sources are cited.',
        weight: 10,
      },
    ],
    dueAt: inDays(3),
    published: true,
    createdAt: minutesAgo(60 * 24 * 4),
    updatedAt: minutesAgo(60 * 24 * 4),
    preflight: null,
  },
  {
    id: 'a_design_tokens',
    courseId: 'c_designsys',
    teacherId: 'u_lina',
    title: 'Accessible design-token system',
    instructions: `Create a small design-token system for a fictional campus library and document it as a PDF or text file with screenshots or code.

Include: a cover page, your token principles, the core colour/type/spacing tokens with values, at least two components using the tokens, accessibility checks for contrast and focus, and a handoff note. Explain one decision you changed after testing.

Show evidence rather than describing an ideal system. Include source files or a code snippet where possible. Cite accessibility guidance you relied on.`,
    requiredSections: ['Cover page', 'Token principles', 'Core tokens', 'Components', 'Accessibility checks', 'Handoff note'],
    rubric: [
      {
        id: 'a_design_tokens-r1',
        label: 'Token system',
        description: 'Tokens are coherent, reusable and cover colour, type and spacing with real values.',
        weight: 25,
      },
      {
        id: 'a_design_tokens-r2',
        label: 'Component application',
        description: 'At least two components apply the tokens consistently and show their states.',
        weight: 20,
      },
      {
        id: 'a_design_tokens-r3',
        label: 'Accessibility evidence',
        description: 'Contrast and focus are tested with evidence, not only claimed.',
        weight: 25,
      },
      {
        id: 'a_design_tokens-r4',
        label: 'Handoff quality',
        description: 'Another designer can extend the system from the documentation.',
        weight: 20,
      },
      {
        id: 'a_design_tokens-r5',
        label: 'Iteration note',
        description: 'Explains a specific change made after testing and why.',
        weight: 10,
      },
    ],
    dueAt: inDays(6),
    published: true,
    createdAt: minutesAgo(60 * 24 * 3),
    updatedAt: minutesAgo(60 * 24 * 3),
    preflight: null,
  },
  {
    id: 'a_health_fhir',
    courseId: 'c_health',
    teacherId: 'u_sanjay',
    title: 'FHIR patient-summary dashboard',
    instructions: `Design a dashboard that helps a clinician answer one safe, well-scoped question from a FHIR patient summary.

Submit a PDF or text/code file containing: a cover page, the clinical question and user, the FHIR resources you would read, a privacy and consent note, a dashboard wireframe or code, and testing evidence with three sample states (loaded, empty, error). Add a reflection on a risk you would escalate.

Never use real patient data. Use synthetic examples. Cite the FHIR specification and any privacy guidance. State clearly what the dashboard must not decide.`,
    requiredSections: ['Cover page', 'Clinical question', 'FHIR resources', 'Privacy and consent', 'Dashboard', 'Testing evidence', 'Reflection'],
    rubric: [
      {
        id: 'a_health_fhir-r1',
        label: 'Clinical framing',
        description: 'Defines a specific user, decision and safe scope for the dashboard.',
        weight: 20,
      },
      {
        id: 'a_health_fhir-r2',
        label: 'FHIR modelling',
        description: 'Uses appropriate FHIR resources and fields with plausible mappings.',
        weight: 20,
      },
      {
        id: 'a_health_fhir-r3',
        label: 'Privacy and safety',
        description: 'Applies consent, minimum-necessary and escalation thinking to the design.',
        weight: 25,
      },
      {
        id: 'a_health_fhir-r4',
        label: 'Dashboard evidence',
        description: 'Shows loaded, empty and error states with enough detail to evaluate the experience.',
        weight: 20,
      },
      {
        id: 'a_health_fhir-r5',
        label: 'Reflection',
        description: 'Names a real risk and a responsible escalation path.',
        weight: 15,
      },
    ],
    dueAt: inDays(8),
    published: true,
    createdAt: minutesAgo(60 * 24 * 2),
    updatedAt: minutesAgo(60 * 24 * 2),
    preflight: null,
  },
  {
    id: 'a_circular_flow',
    courseId: 'c_circular',
    teacherId: 'u_elise',
    title: 'Material-flow map for a campus product',
    instructions: `Choose one product used on campus and map its material and energy flows from sourcing to end of life.

Submit a PDF or image with: a cover page, the product and system boundary, a material-flow diagram, three evidence-backed hotspots, one circular redesign idea, and a short unit-economics note. Include your assumptions and sources.

Use real data where you can and label estimates clearly. Do not present a diagram without explaining the boundary. You may use AI to check your reasoning, but the analysis and sources must be your own.`,
    requiredSections: ['Cover page', 'System boundary', 'Material-flow diagram', 'Hotspots', 'Redesign idea', 'Unit economics'],
    rubric: [
      {
        id: 'a_circular_flow-r1',
        label: 'System boundary',
        description: 'The product and boundary are specific, defensible and consistently applied.',
        weight: 20,
      },
      {
        id: 'a_circular_flow-r2',
        label: 'Material-flow evidence',
        description: 'The diagram is readable and supported by data or clearly labelled estimates.',
        weight: 25,
      },
      {
        id: 'a_circular_flow-r3',
        label: 'Hotspot analysis',
        description: 'Three hotspots are prioritised with evidence, not intuition alone.',
        weight: 25,
      },
      {
        id: 'a_circular_flow-r4',
        label: 'Circular redesign',
        description: 'The redesign follows from the hotspots and considers trade-offs.',
        weight: 20,
      },
      {
        id: 'a_circular_flow-r5',
        label: 'Economics and sources',
        description: 'Unit economics are plausible, assumptions are explicit and sources are cited.',
        weight: 10,
      },
    ],
    dueAt: inDays(11),
    published: true,
    createdAt: minutesAgo(60 * 24),
    updatedAt: minutesAgo(60 * 24),
    preflight: null,
  },
]

const textSubmission = ({
  id,
  assignmentId,
  courseId,
  studentId,
  fileName,
  contentText,
  submittedAt,
}) => ({
  id,
  assignmentId,
  courseId,
  studentId,
  attempt: 1,
  fileName,
  mimeType: 'text/markdown',
  size: Buffer.byteLength(contentText, 'utf8'),
  kind: 'text',
  storageDriver: 'inline',
  storageKey: null,
  contentText,
  textExcerpt: contentText.replace(/\s+/g, ' ').trim().slice(0, 420),
  submittedAt,
  late: false,
  status: 'awaiting_review',
  latestAuditId: null,
  teacherDecision: null,
  updatedAt: submittedAt,
})

export const submissions = [
  textSubmission({
    id: 'sub_fsjs_priya',
    assignmentId: 'a_fsjs_api',
    courseId: 'c_fsjs',
    studentId: 'u_priya',
    fileName: 'priya-campus-club-api.md',
    submittedAt: minutesAgo(60 * 19),
    contentText: `# Cover page

**Student:** Priya Sharma
**Student ID:** DN-20418
**Date:** 2026-10-23
**Course:** CS210 Full-Stack JavaScript Studio

# API design

The club needs a small API for events and RSVPs. I designed four endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /api/events | List published events with optional category filter |
| POST | /api/events | Create an event (admin only) |
| POST | /api/events/:id/rsvp | Create or update the signed-in student's RSVP |
| DELETE | /api/events/:id/rsvp | Cancel an RSVP |

Every write validates the body before touching storage. RSVP capacity is checked inside the route, and errors use a consistent \`{ error: { message } }\` shape.

# Implementation

\`\`\`js
import express from 'express'
import { requireAuth } from './auth.js'

const router = express.Router()

router.post('/events/:id/rsvp', requireAuth, async (req, res, next) => {
  try {
    const event = await events.findById(req.params.id)
    if (!event) return res.status(404).json({ error: { message: 'Event not found.' } })
    if (event.rsvps.length >= event.capacity) {
      return res.status(409).json({ error: { message: 'This event is full.' } })
    }
    const rsvp = await events.upsertRsvp(event.id, req.user.id)
    return res.status(201).json({ data: rsvp })
  } catch (error) {
    next(error)
  }
})

router.get('/events', async (req, res) => {
  const category = String(req.query.category || '').trim()
  const data = await events.list({ category })
  res.json({ data })
})

export default router
\`\`\`

# Testing evidence

1. \`GET /api/events?category=careers\` returned **200** with two events and no unrelated categories.
2. \`POST /api/events/e_12/rsvp\` while signed in returned **201**, and a second call updated the same RSVP instead of duplicating it.
3. \`POST /api/events/e_13/rsvp\` for a full event returned **409** with \`This event is full.\`
4. \`POST /api/events\` without an admin token returned **403**.

# Reflection

The main trade-off was storing capacity as a number on the event versus deriving it from ticket records. I kept capacity on the event because it makes the capacity check a single read and matches how club admins actually work. The cost is that changing capacity later needs its own admin flow. If the club starts selling paid tickets, I would move capacity into a ticket inventory service so the two numbers cannot drift.`,
  }),
  textSubmission({
    id: 'sub_prog_priya',
    assignmentId: 'a_prog_cli',
    courseId: 'c_prog',
    studentId: 'u_priya',
    fileName: 'priya-budget-cli.md',
    submittedAt: minutesAgo(60 * 7),
    contentText: `# Cover page

Priya Sharma — DN-20418

# Setup and run

Run \`node budget.js add "coffee" 4.50\` to record an expense. Run \`node budget.js summary\` to print the month total.

# Function design

\`parseArgs\` reads the command and returns a typed action. \`addExpense\` validates the amount and appends a record. \`summarise\` groups records by month. Errors are returned as messages instead of stack traces.

\`\`\`js
function addExpense(records, label, amount) {
  const value = Number(amount)
  if (!label || !Number.isFinite(value) || value <= 0) {
    throw new Error('Use a label and a positive amount.')
  }
  return [...records, { label, amount: value, at: new Date().toISOString() }]
}
\`\`\`

# Reflection

I fixed a bug where a negative amount was silently accepted because \`Number(amount)\` returned a usable number. I added \`value <= 0\` and a test for it. I still need to add a proper automated test file and show the command output.`,
  }),
  textSubmission({
    id: 'sub_prod_daniel',
    assignmentId: 'a_prod_discovery',
    courseId: 'c_prod',
    studentId: 'u_daniel',
    fileName: 'daniel-commute-discovery.md',
    submittedAt: minutesAgo(60 * 31),
    contentText: `# Cover page

Daniel Kim — BUS240

# Research question

How do students decide between the campus shuttle and public transport on rainy mornings?

# Method

I spoke with three students who commute more than 30 minutes. Two take the shuttle at least twice a week; one uses the train. I asked them to walk me through the last rainy morning and where they checked for delays.

# Insights

1. Students check a group chat before the official shuttle page because the page does not show live delays.
2. A missed shuttle feels worse than a delayed train because the next shuttle is 25 minutes away.
3. Students optimise for certainty, even when the train is faster on average.
4. Two participants did not know the shuttle had a live map.
5. Weather changes the decision the night before, not only on the morning.

# Opportunity map

The strongest opportunity is a single “next reliable departure” view that combines official schedule, live delay notes and walking time. A smaller opportunity is a push note before rain days. I would not build a new route planner yet.

# Recommendation

Pilot a reliability card in the existing shuttle page for four weeks. Assumption: students will trust a delay note only if it is timestamped and owned by a named dispatcher. Next test: prototype the card with five students and measure whether they can choose a departure in under 15 seconds.

# Ethics note

Participants are anonymised. Quotes are paraphrased and labelled as interview evidence.`,
  }),
  textSubmission({
    id: 'sub_design_meera',
    assignmentId: 'a_design_tokens',
    courseId: 'c_designsys',
    studentId: 'u_meera',
    fileName: 'meera-library-tokens.md',
    submittedAt: minutesAgo(60 * 52),
    contentText: `# Cover page

Meera Iyer — DES220

# Token principles

The system should feel calm, legible and obviously extendable. Tokens are named by purpose, not by colour value. Every token must survive dark mode and keyboard focus.

# Core tokens

\`\`\`css
:root {
  --surface: #f7f4ed;
  --surface-raised: #ffffff;
  --text: #1d2420;
  --text-muted: #5a665e;
  --accent: #0f6b4f;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --radius-card: 14px;
  --font-display: "Source Serif 4", serif;
  --font-body: "Inter", sans-serif;
}
\`\`\`

# Components

The \`ResourceCard\` uses raised surface, 16px spacing, a 14px radius and the accent only for the primary action. The \`FilterChip\` has default, hover, selected and focus states. Both components are documented with the tokens they consume.

# Accessibility checks

The body text pair \`#1d2420\` on \`#f7f4ed\` measures **12.8:1**. The muted text pair measures **5.2:1**. Focus uses a 2px outline with a 3:1 contrast check against both surfaces. I tested with a keyboard only and confirmed the focus ring is never clipped by the card overflow.

# Handoff note

A new component should reuse existing tokens before adding a new one. The Figma library and CSS variables share the same names.

# Iteration note

My first accent was a brighter green. It failed the large-text contrast check on the raised surface, so I changed it to the current darker green and re-tested both pairings.`,
  }),
  textSubmission({
    id: 'sub_health_tomas',
    assignmentId: 'a_health_fhir',
    courseId: 'c_health',
    studentId: 'u_tomas',
    fileName: 'tomas-fhir-dashboard.md',
    submittedAt: minutesAgo(60 * 70),
    contentText: `# Cover page

Tomas Alvarez — HLT310

# Clinical question

For a patient with a known penicillin allergy, can a triage nurse quickly confirm the allergy and the most recent relevant observation before a consultation?

# FHIR resources

I would read \`Patient\` for identity, \`AllergyIntolerance\` for the recorded allergy and \`Observation\` for the latest vital signs. I would not display the full history on the first screen; the dashboard links to the record instead.

# Privacy and consent

Use synthetic data only. Apply minimum-necessary access: a triage nurse sees identity, allergy and recent observations, not billing or unrelated notes. The session should require campus SSO and log access. If the allergy record is missing, the dashboard must show “not recorded”, never “no allergy”.

# Dashboard

The wireframe has a patient banner, an allergy alert with provenance and timestamp, a latest-observation card, and a clear “open full record” action. The three states are loaded, empty and error.

# Testing evidence

I used the public FHIR sample bundle to create three synthetic states:

- Loaded: penicillin allergy present, last observation 14 minutes ago.
- Empty: no allergy record; the alert says “Allergy status not recorded”.
- Error: the Observation request times out; the card shows an error with a retry and the rest of the dashboard stays usable.

# Reflection

The biggest risk is false reassurance if an allergy record is absent. I would escalate missing allergy data to the clinical lead and log it as a data-quality issue rather than silently hiding the card. I would also ask for a usability test with a triage nurse before piloting.`,
  }),
]
