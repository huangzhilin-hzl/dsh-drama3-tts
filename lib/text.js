/** Pure preparation and segmentation of one reply into spoken text. */
import { DIRECTION_TAG, PHONEME_SPAN, bareScript } from './script-validation.js'

export const MAX_SPEECH_CHARS = 1200
const WHOLE_REPLY_MAX_UNITS = 320
export const CONTINUOUS_DELIVERY = '自然地讲解，语气平稳，句子衔接连贯'
const MIN_LOCAL_AUDIO_TOKENS = 1024
const MAX_LOCAL_AUDIO_TOKENS = 2048

// Keep the host's existing error contract while this module stays independent
// of HTTP routing, configuration, storage and upstream services.
function segmentError(code) {
  return Object.assign(new Error(code), { status: 413, code })
}

/** Turn table records into speakable facts before the editor summarizes them. */
function tableToSpeech(text) {
  const lines = text.split('\n')
  const output = []
  const cells = (line) => line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
  const divider = (line) => {
    const row = cells(line)
    return row.length >= 2 && row.every((cell) => /^:?-{3,}:?$/.test(cell))
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.includes('|') && index + 1 < lines.length && divider(lines[index + 1])) {
      const headers = cells(line)
      index++
      let rows = 0
      while (index + 1 < lines.length && lines[index + 1].includes('|') && lines[index + 1].trim() !== '') {
        const row = cells(lines[++index])
        if (divider(lines[index])) continue
        output.push(row.map((value, column) => value ? `${headers[column] ? `${headers[column]}：` : ''}${value}` : '').filter(Boolean).join('，') + '。')
        rows++
      }
      if (rows === 0) output.push(headers.join('，') + '。')
    } else if (/^\s*\|.*\|\s*$/.test(line)) {
      if (!divider(line)) output.push(cells(line).filter(Boolean).join('，') + '。')
    } else output.push(line)
  }
  return output.join('\n')
}

function spokenComparisons(text) {
  const chinese = /[\p{Script=Han}]/u.test(text)
  const labels = chinese
    ? { '<': '小于', '>': '大于', '<=': '小于或等于', '>=': '大于或等于', '≤': '小于或等于', '≥': '大于或等于' }
    : { '<': 'less than', '>': 'greater than', '<=': 'less than or equal to', '>=': 'greater than or equal to', '≤': 'less than or equal to', '≥': 'greater than or equal to' }
  return text.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/<=|>=|[<>≤≥]/g, (operator) => ` ${labels[operator]} `)
}

/** Drop formatting while retaining inline names, comparison limits and table facts. */
export function stripMarkup(text, keepDirectionTags = false) {
  let source = String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, '$1')
    // A quote marker is formatting; a leading numeric comparison is content.
    .replace(/^[ \t]*>[ \t]?(?=[^\s\d=+\-])/gm, ' ')
    // List indices are presentation, unlike numbers inside the list item.
    .replace(/^[ \t]*\d{1,9}[.)、][ \t]+/gm, ' ')
  source = tableToSpeech(source)

  const parked = []
  if (keepDirectionTags) {
    source = source.replace(DIRECTION_TAG, (match) => {
      parked.push(match)
      return `\uE000${parked.length - 1}\uE001`
    })
  }
  // A tag must begin with a name, so `< 24GB ... > 24GB` never consumes the
  // intervening conditions, negations or measurements as if they were HTML.
  source = source.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<!DOCTYPE\s[^>]*>/gi, ' ')
    .replace(/<\/?[a-z][a-z\d:-]*(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\s*\/?>/gi, ' ')
  source = spokenComparisons(source)
  if (keepDirectionTags) {
    source = source.replace(/\uE000(\d+)\uE001/g, (_, index) => parked[Number(index)] ?? ' ')
  }

  return source
    .replace(/\bhttps?:\/\/\S+/g, ' ')
    .replace(/\bwww\.\S+/g, ' ')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, ' ')
    .replace(/^[ \t]*[-*+][ \t]+/gm, ' ')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
}

/** Remove bracketed stage directions such as `[laughs]` or `【叹气】`. */
export function stripBracketTags(text) {
  return String(text)
    .replace(/\[[^\]\n]{1,60}\]/g, ' ')
    .replace(/【[^】\n]{1,60}】/g, ' ')
}

/** Collapse whitespace and discard leading punctuation left by text cleanup. */
export function tidy(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/^[\s、，。；：,.;:!?！？]+/, '')
    .trim()
}

/** Normalize a reply before summary, pronunciation and segmentation planning. */
export function prepareText(text, tagMode) {
  const stripped = tagMode === 'keep'
    ? stripMarkup(text, true)
    : stripBracketTags(stripMarkup(text))
  return tidy(stripped)
}

/** Keep implementation strings visible in the chat, but out of the fallback voice. */
export function omitTechnicalCode(text) {
  let omittedCode = 0
  const categories = new Set()
  const omit = (kind, replacement) => () => { omittedCode++; categories.add(kind); return replacement }
  let spoken = String(text)
    .replace(/\b[A-Z][A-Z0-9_]{4,}=(?:"[^"\n]*"|'[^'\n]*'|[^\s，。；;!?！？]+)/g, omit('配置', '该配置项'))
    .replace(/(?<![A-Za-z0-9_])--[A-Za-z][A-Za-z0-9_-]{4,}(?:=(?:"[^"\n]*"|'[^'\n]*'|[^\s，。；;!?！？]+)|[ \t]+[A-Za-z0-9_./:=+@~%$\\-]+)?/g, omit('命令', '该命令参数'))
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/g, omit('配置', '该配置项'))
    .replace(/(?<![A-Za-z0-9_:])(?:~?\/|\.\.?\/|[A-Za-z]:\\)[^\s，。；;!?！？<>\[\]]+/g, omit('路径', '该路径'))
  if (omittedCode) {
    spoken = tidy(spoken)
    if (!/[。！？.!?]$/.test(spoken)) spoken += '。'
    spoken += `具体${[...categories].join('、')}见原文。`
  }
  return { text: spoken, omittedCode }
}

/** A conservative generation allowance, not a prediction of speech duration. */
export function localSpeechTokenBudget(text) {
  let units = 0
  const plain = bareScript(String(text)).replace(PHONEME_SPAN, (_, phones) => {
    const tokens = phones.trim().split(/\s+/).filter(Boolean)
    // Stress-marked vowels approximate syllables; the fallback also accounts
    // for unmarked phones. Control syntax itself must not inflate the budget.
    units += Math.max(tokens.filter((phone) => /[012]$/.test(phone)).length, Math.ceil(tokens.length / 3))
    return ' '
  })
  for (const token of plain.match(/[A-Za-z]+|\p{L}|\p{N}/gu) ?? []) {
    units += /^[A-Za-z]+$/.test(token) ? Math.ceil(token.length / 3) : 1
  }
  // Reserve room for natural pauses and a slower delivery. The local serving
  // default (500) can truncate whole replies, even though the request succeeds.
  return Math.min(MAX_LOCAL_AUDIO_TOKENS, Math.max(MIN_LOCAL_AUDIO_TOKENS, 256 + units * 8))
}

/** Split at sentences/clauses, keeping English words and pronunciation spans atomic. */
export function splitSegments(text, maxChars, globalDelivery = '') {
  const limit = Math.min(600, Math.max(40, Math.round(maxChars)))
  // Only the compiler's known whole-reply direction can cross a boundary.
  // Local emotion, pause and closing cues remain at their original positions.
  const requestedCue = globalDelivery === CONTINUOUS_DELIVERY ? `[${globalDelivery}]` : ''
  const source = String(text)
  const sharedCue = requestedCue && source.startsWith(requestedCue) ? requestedCue : ''
  const tokens = source.slice(sharedCue.length).match(/<\|phoneme_start\|>[\s\S]*?<\|phoneme_end\|>|<\/?(?:emphasis|whisper|soft|fast|slow|stress|forceful)>|\[[^\]\n]{1,60}\]|[A-Za-z0-9]+(?:[_.:/+#-][A-Za-z0-9]+)*|[\s\S]/gu) ?? []
  const segments = []
  const stack = []
  let buffer = sharedCue
  let count = 0
  let boundary = ''
  const closing = () => [...stack].reverse().map((tag) => `</${tag}>`).join('')
  const flush = () => {
    if (count === 0) return
    const piece = buffer.trim() + closing()
    if (piece.length > MAX_SPEECH_CHARS) throw segmentError('segment-too-long')
    if (bareScript(piece).trim()) segments.push(piece)
    buffer = sharedCue + stack.map((tag) => `<${tag}>`).join('')
    count = 0
    boundary = ''
  }
  for (const token of tokens) {
    const paired = /^<(\/)?([a-z]+)>$/.exec(token)
    if (paired?.[1]) {
      if (stack.at(-1) === paired[2]) stack.pop()
      buffer += token
      continue
    }
    const naturalBreak = (boundary === 'sentence' && count >= limit * 0.6)
      || (count >= limit && (boundary === 'clause' || boundary === 'space'))
      || count >= limit * 1.5
    const reserve = closing().length + (paired ? `</${paired[2]}>`.length : 0)
    const punctuation = /^[。！？!?；;…，,:：.]+$/u.test(token)
    if ((naturalBreak && !punctuation) || buffer.length + token.length + reserve > MAX_SPEECH_CHARS) flush()
    if (buffer.length + token.length + reserve > MAX_SPEECH_CHARS) throw segmentError('speech-token-too-long')
    if (paired) {
      stack.push(paired[2])
      buffer += token
      continue
    }
    if (token.startsWith('[') && token.endsWith(']')) {
      buffer += token
      continue
    }
    buffer += token
    count += token.startsWith('<|phoneme_start|>')
      ? token.slice('<|phoneme_start|>'.length, -'<|phoneme_end|>'.length).length
      : Array.from(token).length
    boundary = token === '.' || /[。！？!?；;…\n]$/u.test(token) ? 'sentence'
      : /[，,:：]$/u.test(token) ? 'clause' : /^\s+$/u.test(token) ? 'space' : ''
  }
  flush()
  return segments
}

/** Measure the readable answer, never pronunciation/control-token overhead. */
export function estimateSpokenUnits(text) {
  const plain = bareScript(String(text))
  return (plain.match(/[\p{Script=Latin}\p{N}]+(?:[_.:/+#'’\-][\p{Script=Latin}\p{N}]+)*|\p{L}/gu) ?? []).length
}

/** Keep a short answer in one generation so the model can plan its full cadence. */
export function planSegments(spokenText, synthesisText, maxChars, wholeReplyEnabled = true, globalDelivery = '') {
  const spokenUnits = estimateSpokenUnits(spokenText)
  const readableLength = bareScript(String(spokenText)).trim().length
  const shortEnough = spokenUnits <= WHOLE_REPLY_MAX_UNITS && readableLength <= WHOLE_REPLY_MAX_UNITS
  const payloadFits = synthesisText.length <= MAX_SPEECH_CHARS
  if (wholeReplyEnabled && shortEnough && payloadFits) {
    return {
      segments: synthesisText.trim() ? [synthesisText] : [],
      synthesisMode: 'whole-reply', spokenUnits, segmentationReason: null,
    }
  }
  return {
    segments: splitSegments(synthesisText, maxChars, globalDelivery),
    synthesisMode: 'segmented', spokenUnits,
    segmentationReason: !wholeReplyEnabled ? 'disabled' : payloadFits ? 'long-reply' : 'payload-limit',
  }
}

export function boundedContext(context) {
  if (!Array.isArray(context)) return []
  const result = []
  let remaining = 4000
  for (const entry of context.slice(-6).reverse()) {
    if (!entry || !['user', 'assistant'].includes(entry.role) || typeof entry.content !== 'string') continue
    const content = prepareText(entry.content, 'strip').slice(0, Math.min(1000, remaining))
    if (!content) continue
    result.unshift({ role: entry.role, content })
    remaining -= content.length
    if (remaining <= 0) break
  }
  return result
}
