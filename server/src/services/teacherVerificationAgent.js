import { GoogleGenAI, Type } from '@google/genai'
import { config, aiEnabled } from '../config.js'
import { HttpError } from '../utils/http.js'

export const TEACHER_VERIFICATION_PROMPT_VERSION = 'teacher-verification-v1'

const VERDICTS = ['AI_APPROVED', 'AI_NEEDS_REVIEW', 'AI_DENIED']
const CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW']

const stringArray = { type: Type.ARRAY, items: { type: Type.STRING } }

const verificationSchema = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, enum: VERDICTS },
    confidence: { type: Type.STRING, enum: CONFIDENCE },
    recommendation: { type: Type.STRING },
    extracted: {
      type: Type.OBJECT,
      properties: {
        fullName: { type: Type.STRING },
        documentNumber: { type: Type.STRING },
        issuingInstitution: { type: Type.STRING },
        issueDate: { type: Type.STRING },
        expiryDate: { type: Type.STRING },
        documentType: { type: Type.STRING },
        country: { type: Type.STRING },
      },
      required: ['fullName', 'documentNumber', 'issuingInstitution', 'issueDate', 'expiryDate', 'documentType', 'country'],
    },
    checks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          passed: { type: Type.BOOLEAN },
          note: { type: Type.STRING },
        },
        required: ['label', 'passed', 'note'],
      },
    },
    reasons: stringArray,
    redFlags: stringArray,
  },
  required: ['verdict', 'confidence', 'recommendation', 'extracted', 'checks', 'reasons', 'redFlags'],
}

let client = null

function gemini() {
  if (!aiEnabled) {
    throw new HttpError(
      503,
      'Gemini is not configured. Add GEMINI_API_KEY on the server to enable AI document verification.',
    )
  }
  if (!client) {
    client = new GoogleGenAI({
      apiKey: config.geminiApiKey,
      httpOptions: { timeout: config.geminiTimeoutMs },
    })
  }
  return client
}

function friendlyAiError(error) {
  if (error instanceof HttpError) return error
  const message = String(error?.message || '')
  if (/api key|permission denied|unauthenticated/i.test(message)) {
    return new HttpError(503, 'Gemini rejected the API key. Check GEMINI_API_KEY on the server.')
  }
  if (/429|quota|rate limit|resource exhausted/i.test(message)) {
    return new HttpError(503, 'The AI verifier is busy right now. Wait a moment and try again.')
  }
  if (/timeout|timed out|aborted/i.test(message)) {
    return new HttpError(504, 'The AI verification took too long. Try smaller files or retry.')
  }
  return new HttpError(502, 'The AI verifier could not finish this check. Please try again.')
}

function parseJson(text) {
  const cleaned = String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        // ignore
      }
    }
    throw new HttpError(502, 'The AI returned an unreadable verification. Please run the check again.')
  }
}

const text = (value, max = 400) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const array = (value) => (Array.isArray(value) ? value : [])

function normalizeResult(raw, { applicantName, email }) {
  const verdict = array([raw?.verdict]).find((v) => VERDICTS.includes(v)) || 'AI_NEEDS_REVIEW'
  const confidence = array([raw?.confidence]).find((v) => CONFIDENCE.includes(v)) || 'MEDIUM'
  const extracted = raw?.extracted || {}
  const checks = array(raw?.checks)
    .map((c) => ({
      label: text(c?.label, 160) || 'Check',
      passed: c?.passed === true,
      note: text(c?.note, 320),
    }))
    .slice(0, 12)
  let reasons = array(raw?.reasons).map((r) => text(r, 320)).filter(Boolean).slice(0, 8)
  let redFlags = array(raw?.redFlags).map((r) => text(r, 320)).filter(Boolean).slice(0, 6)

  const extractedName = text(extracted?.fullName, 160).toLowerCase()
  const appName = text(applicantName, 160).toLowerCase()
  if (appName && extractedName && !extractedName.includes(appName.split(' ')[0]) && !appName.includes(extractedName.split(' ')[0])) {
    redFlags = ['Name on document does not appear to match the applicant name.', ...redFlags].slice(0, 6)
    reasons = ['Name mismatch between application and document.', ...reasons].slice(0, 8)
    if (verdict === 'AI_APPROVED') verdict = 'AI_NEEDS_REVIEW'
  }

  if (verdict === 'AI_DENIED' && redFlags.length === 0) {
    verdict = 'AI_NEEDS_REVIEW'
  }

  return {
    verdict,
    confidence,
    recommendation: text(raw?.recommendation, 600) || 'Review the documents and reasons before making a final decision.',
    extracted: {
      fullName: text(extracted?.fullName, 160),
      documentNumber: text(extracted?.documentNumber, 80),
      issuingInstitution: text(extracted?.issuingInstitution, 160),
      issueDate: text(extracted?.issueDate, 40),
      expiryDate: text(extracted?.expiryDate, 40),
      documentType: text(extracted?.documentType, 80),
      country: text(extracted?.country, 80),
    },
    checks,
    reasons,
    redFlags,
    _meta: { applicantName, email },
  }
}

function heuristicVerification({ applicantName, email }) {
  return {
    verdict: 'AI_NEEDS_REVIEW',
    confidence: 'LOW',
    recommendation: 'AI is not configured. A human admin must review these documents.',
    extracted: {
      fullName: applicantName || '',
      documentNumber: '',
      issuingInstitution: '',
      issueDate: '',
      expiryDate: '',
      documentType: '',
      country: '',
    },
    checks: [
      { label: 'Documents uploaded', passed: true, note: 'Manual review required.' },
      { label: 'Identity match', passed: false, note: 'Cannot verify automatically without Gemini.' },
      { label: 'Legitimacy', passed: false, note: 'Cannot verify automatically without Gemini.' },
    ],
    reasons: ['Offline mode: no automatic verification performed.'],
    redFlags: [],
    provider: 'heuristic',
    model: 'local-teacher-verifier-v1',
  }
}

function verificationPrompt({ applicantName, email, phone, fieldSlug, headline }) {
  return `You are Denning Nexus Teacher Document Verifier. You are doing a conservative first-pass verification of teacher application documents.

APPLICANT
Name: ${applicantName || 'Unknown'}
Email: ${email || 'Unknown'}
Phone: ${phone || 'Unknown'}
Field: ${fieldSlug || 'Unknown'}
Headline: ${headline || 'Unknown'}

TASK
Carefully review the uploaded document image(s)/PDF. Extract key details. Check:
1) Document type (ID, teaching license, degree/certificate, other)
2) Full name on document vs applicant name (be tolerant of small formatting differences)
3) Document number/ID if present
4) Issuing institution/authority
5) Issue/expiry dates if present
6) Readability and completeness
7) Obvious red flags (completely different identity, clearly irrelevant document, missing critical info)

RULES
- Be conservative. Only AI_DENIED if there are SPECIFIC, CONCRETE, VERIFIABLE issues.
- Vague "looks suspicious" should result in AI_NEEDS_REVIEW.
- If unreadable/unclear, use AI_NEEDS_REVIEW.
- Do not accuse of forgery. Use neutral language.
- Name mismatch alone is usually AI_NEEDS_REVIEW unless extremely different with no relation.
- Missing expiry is not automatically a denial unless required by the document type.
- Return ONLY the requested JSON object.
- The admin makes the final decision regardless of verdict.`
}

export async function verifyTeacherDocuments({ applicantName, email, phone, fieldSlug, headline, documents = [] }) {
  if (!aiEnabled) {
    return heuristicVerification({ applicantName, email })
  }
  if (!documents.length) {
    throw new HttpError(400, 'At least one document is required for verification.')
  }

  const parts = [{ text: verificationPrompt({ applicantName, email, phone, fieldSlug, headline }) }]
  for (const doc of documents.slice(0, 4)) {
    if (doc.buffer && doc.mimeType) {
      parts.push({
        inlineData: {
          mimeType: doc.mimeType,
          data: doc.buffer.toString('base64'),
        },
      })
    } else if (doc.text) {
      parts.push({ text: `\n<<<DOCUMENT CONTENT>>>\n${String(doc.text).slice(0, 40000)}\n<<<END DOCUMENT>>>\n` })
    }
  }

  const response = await gemini()
    .models.generateContent({
      model: config.geminiModel,
      contents: [{ role: 'user', parts }],
      config: {
        temperature: 0.1,
        topP: 0.9,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: verificationSchema,
        systemInstruction:
          'You are a conservative document verifier. Prioritize human review when uncertain. Never fabricate accusations. Return only valid JSON.',
      },
    })
    .catch((error) => {
      console.error('[teacher-ai]', error?.message || error)
      throw friendlyAiError(error)
    })

  const text = response.text || ''
  const raw = parseJson(text)
  const normalized = normalizeResult(raw, { applicantName, email })
  return {
    ...normalized,
    provider: 'gemini',
    model: config.geminiModel,
    promptVersion: TEACHER_VERIFICATION_PROMPT_VERSION,
    usage: response.usageMetadata
      ? {
          inputTokens: response.usageMetadata.promptTokenCount || 0,
          outputTokens: response.usageMetadata.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata.totalTokenCount || 0,
        }
      : null,
  }
}

export function teacherVerificationMeta() {
  return {
    enabled: aiEnabled,
    provider: aiEnabled ? 'gemini' : 'heuristic',
    model: aiEnabled ? config.geminiModel : 'local-teacher-verifier-v1',
    promptVersion: TEACHER_VERIFICATION_PROMPT_VERSION,
  }
}
