/** Structural and factual guards applied before speech synthesis. */

/** Paired tags Drama 3 treats as per-word direction (its documented set). */
export const DIRECTION_TAG = /<\/?(?:emphasis|whisper|soft|fast|slow|stress|forceful)>/gi

export const PHONEME_SPAN = /<\|phoneme_start\|>([\s\S]*?)<\|phoneme_end\|>/g

// Drama 3 accepts short natural-language directions, including Chinese. The
// boundary here protects script structure, not a vocabulary whitelist.
function validStageTag(value) {
  return value.trim().length > 0 && Array.from(value).length <= 60 && !/[<>\[\]{}\u0000-\u001f\u007f]/u.test(value)
}
const PAIRED_TAGS = new Set(['emphasis', 'whisper', 'soft', 'fast', 'slow', 'stress', 'forceful'])

export function bareScript(text) {
  return String(text).replace(DIRECTION_TAG, '').replace(/\[[^\]\n]{1,60}\]/g, '')
}

/** Ignore spacing introduced around tags, but never tolerate changed words. */
export function comparable(text) {
  return String(text).replace(/\s+/gu, '')
}

export function validScript(candidate, original, maxTags = 6) {
  const body = String(candidate).trim()
  if (!body || comparable(bareScript(body)) !== comparable(original)) return false
  if (/[<>\[\]]/.test(body.replace(/<[^>]*>|\[[^\]\n]*\]/g, ''))) return false
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body)) return false
  const stack = []
  let count = 0
  const tokens = body.match(/<[^>]*>|\[[^\]\n]*\]/g) ?? []
  for (const token of tokens) {
    if (token.startsWith('[')) {
      if (!validStageTag(token.slice(1, -1))) return false
      count++
      continue
    }
    const match = /^<(\/)?([a-z]+)>$/.exec(token)
    if (!match || !PAIRED_TAGS.has(match[2])) return false
    if (match[1]) {
      if (stack.pop() !== match[2]) return false
    } else {
      if (stack.length > 0) return false
      stack.push(match[2])
      count++
    }
  }
  return stack.length === 0 && count <= maxTags
}

/** A malformed tag, changed digit or changed negation invalidates the script. */
export function sanitizeTagged(tagged, original, maxTags = 6) {
  return validScript(tagged, original, maxTags) ? String(tagged).trim() : original
}

/** Only complete, bounded ARPAbet controls from the pronunciation compiler pass. */
export function validSynthesisScript(text) {
  let valid = true
  const stripped = String(text).replace(PHONEME_SPAN, (_, phones) => {
    if (phones.length === 0 || phones.length > 320 || !/^[A-Z]+[012]?(?: [A-Z]+[012]?)*$/.test(phones)) valid = false
    return 'pronunciation'
  })
  return valid && validScript(stripped, bareScript(stripped), 12)
}

// Numeric guards operate before pronunciation expands acronyms or speaks digits.
// These checks catch unsupported values; they do not prove semantic equivalence.
function canonicalNumber(value) {
  const raw = value.replaceAll(',', '').replace(/^\+/, '')
  if ((raw.match(/\./g) ?? []).length > 1) return `version:${raw}`
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw)
  if (!match) return raw.toLowerCase()
  const whole = match[2].replace(/^0+(?=\d)/, '')
  const fraction = (match[3] || '').replace(/0+$/, '')
  const zero = whole === '0' && !fraction
  return `${zero ? '' : match[1]}${whole}${fraction ? `.${fraction}` : ''}`
}

function numericFacts(text) {
  const facts = new Map()
  const identifiers = new Map()
  // A postfix × and 倍 express the same multiplier. Normalize before masking
  // identifiers, so 64×SM100 cannot turn into a spurious 64× suffix. Restrict
  // the right boundary to prose endings: 6.5×2, 6.5×N and 6.5×系数 remain math.
  const numericText = String(text).replace(
    /(?<![A-Za-z0-9_.])([+-]?\d+(?:,\d{3})*(?:\.\d+)?)\s*×(?=\s*(?:$|[，。；：！？、,.!?;:)\]）】」』”’]|的|左右|以上|以下|上下))/gu,
    '$1倍',
  )
  // Units are retained with their value. Precision names such as W4A16 and
  // model/version identifiers are masked before standalone numbers are read.
  const unitPattern = '(?:tokens?\\/s|tok\\/s|GiB|MiB|KiB|TiB|GHz|MHz|kHz|Hz|GB|MB|KB|TB|ms|μs|us|ns|sec|seconds?|minutes?|min|hours?|fps|tps|kW|mV|bytes?|bit|bits|[%％℃]|°C|[sShHWVB]|毫秒|微秒|纳秒|分钟|小时|比特|秒|次|倍|位|字|个|条|轮|步|天|周|月|年)'
  const unitAtStart = new RegExp(`^\\s*(${unitPattern})(?![A-Za-z])`, 'u')
  let remaining = numericText.replace(/(?<![A-Za-z0-9_])(?:[A-Za-z][A-Za-z0-9_]*(?:[.-][A-Za-z0-9_]+)*|\d+[A-Za-z][A-Za-z0-9_]*)(?![A-Za-z0-9_])/g, (token) => {
    if (!/\d/.test(token)) return token
    // 24GB is a measurement, while GSM8K, v1.2.3 and W4A16 are names.
    if (/^\d/.test(token)) {
      const numericPrefix = /^\d+/.exec(token)[0]
      const suffix = token.slice(numericPrefix.length)
      if (unitAtStart.exec(suffix)?.[0] === suffix) return token
    }
    identifiers.set(token.toLowerCase(), token)
    return ' '.repeat(token.length)
  })
  const numberPattern = /(?<![A-Za-z0-9_])(?:[+-](?=\d))?\d+(?:,\d{3})*(?:\.\d+)*(?![A-Za-z0-9_])/g
  // A measurement can be directly followed by a unit (24GB), so include an
  // explicit unit alternative instead of treating its digits as an identifier.
  const measuredPattern = new RegExp(`(?<![A-Za-z0-9_])[+-]?\\d+(?:,\\d{3})*(?:\\.\\d+)*\\s*${unitPattern}(?![A-Za-z])`, 'gu')
  remaining = remaining.replace(measuredPattern, (token) => {
    const match = /^([+-]?\d+(?:,\d{3})*(?:\.\d+)*)([\s\S]*)$/.exec(token)
    const unit = match[2].trim().replace('％', '%')
    const key = `${canonicalNumber(match[1])}|${unit}`
    facts.set(key, token.trim())
    return ' '.repeat(token.length)
  })
  for (const match of remaining.matchAll(numberPattern)) {
    facts.set(`${canonicalNumber(match[0])}|`, match[0])
  }
  return { facts, identifiers }
}

export function summaryRejection(candidate, original) {
  if (typeof candidate !== 'string') return { reason: 'invalid-structure' }
  const body = candidate.trim()
  if (!body || /[<>\[\]{}]|```/.test(body)) return { reason: 'invalid-structure' }
  if (body === original) return null
  if (body.length > original.length) return { reason: 'expanded' }
  const source = numericFacts(original)
  const output = numericFacts(body)
  const newIdentifiers = [...output.identifiers].filter(([key]) => !source.identifiers.has(key)).map(([, value]) => value)
  if (newIdentifiers.length) return { reason: 'changed-identifier', values: newIdentifiers.slice(0, 8) }
  const newValues = [...output.facts].filter(([key]) => !source.facts.has(key)).map(([, value]) => value)
  if (newValues.length) return { reason: 'new-numeric-value', values: newValues.slice(0, 8) }
  return null
}
