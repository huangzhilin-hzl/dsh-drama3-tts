/** Sentence-level direction, compiled without rewriting any spoken words. */
const INTENTS = new Set(['explain', 'contrast', 'caution', 'next-step', 'closing'])
const PRIORITY = { explain: 0, closing: 1, 'next-step': 2, contrast: 3, caution: 4 }
const MAX_SENTENCES = 12

function validEmphasis(phrase, text) {
  if (phrase === '') return true
  if (typeof phrase !== 'string' || phrase.length > 32 || /[<>\[\]\r\n]/u.test(phrase)) return false
  const index = text.indexOf(phrase)
  if (index < 0) return false
  // Do not emphasize a fragment of an English identifier or number.
  if (/^[A-Za-z0-9_]/.test(phrase) && /[A-Za-z0-9_]/.test(text[index - 1] || '')) return false
  if (/[A-Za-z0-9_]$/.test(phrase) && /[A-Za-z0-9_]/.test(text[index + phrase.length] || '')) return false
  return true
}

/** Recover offsets from exact consecutive source spans, retaining word spaces. */
function alignPlan(text, candidate) {
  if (!Array.isArray(candidate) || !candidate.length || candidate.length > MAX_SENTENCES) return null
  const result = []
  let cursor = 0
  for (const entry of candidate) {
    if (!entry || typeof entry.text !== 'string' || !INTENTS.has(entry.intent)
      || !['none', 'short'].includes(entry.pauseAfter)
      || !['normal', 'slower'].includes(entry.pace)) return null
    const sentence = entry.text.trim()
    if (!sentence || !validEmphasis(entry.emphasis, sentence)) return null
    const before = cursor
    while (/\s/u.test(text[cursor] || '') && cursor < text.length) cursor++
    if (!text.startsWith(sentence, cursor)) return null
    const end = cursor + sentence.length
    if (/[A-Za-z0-9_]/.test(text[end - 1] || '') && /[A-Za-z0-9_]/.test(text[end] || '')) return null
    if (text.slice(end).trim() && !/[。！？!?；;，,:：.][”’"'）)」』]*$/u.test(sentence)) return null
    result.push({ ...entry, text: sentence, prefix: text.slice(before, cursor) })
    cursor += sentence.length
  }
  if (text.slice(cursor).trim() !== '') return null
  return { units: result, suffix: text.slice(cursor) }
}

function englishFullStop(text, index) {
  if (text[index] !== '.' || (index < text.length - 1 && !/\s/u.test(text[index + 1]))) return false
  const prefix = text.slice(0, index + 1)
  // A conservative fallback keeps common technical abbreviations with the
  // following phrase instead of changing pace halfway through that phrase.
  if (/\b(?:vs|e\.g|i\.e|etc|approx|cf|fig|eq|no|dr|mr|mrs|ms|prof)\.$/iu.test(prefix)
    || /\b(?:[A-Za-z]\.){2,}$/u.test(prefix)) return false
  return true
}

function splitSentences(text) {
  const units = []
  let start = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    const end = /[。！？!?]/u.test(char)
      || englishFullStop(text, index)
    if (!end) continue
    while (/[。！？!?.”’」』]/u.test(text[index + 1] || '') && index + 1 < text.length) index++
    units.push(text.slice(start, index + 1))
    start = index + 1
    if (units.length === MAX_SENTENCES - 1) break
  }
  if (text.slice(start).trim()) units.push(text.slice(start))
  return units.length ? units : [text]
}

function rulePlan(text) {
  const sentences = splitSentences(text)
  const result = sentences.map((part, index) => {
    const sentence = part.trim()
    let intent = 'explain'
    if (/^(?:下一步|接下来|随后|Next\b)/iu.test(sentence)) intent = 'next-step'
    else if (/不能|尚未|还没|暂时|未验证|不确定|风险|注意|not yet|uncertain|unverified/iu.test(sentence)) intent = 'caution'
    else if (/^(?:但|不过|然而|只是|另一方面|问题是|But\b|However\b)/iu.test(sentence)) intent = 'contrast'
    else if (index === sentences.length - 1 && sentences.length > 1) intent = 'closing'
    const emphasis = intent === 'caution'
      ? (sentence.match(/(?:还没有验证|尚未验证|暂时不能下结论|不能先下结论|还没解释清楚|不确定|未验证|not yet verified|unverified)/iu)?.[0] ?? '')
      : ''
    return { text: sentence, intent, emphasis, pauseAfter: 'none', pace: intent === 'closing' ? 'slower' : 'normal' }
  })
  for (let index = 0; index < result.length - 1; index++) {
    if (['contrast', 'caution'].includes(result[index + 1].intent)) {
      result[index].pauseAfter = 'short'
      break
    }
  }
  return alignPlan(text, result)
}

/**
 * Use a small cue budget for the whole reply, not a separate performance for
 * every sentence. Invalid model plans fall back to exact source sentences.
 * Pause labels are model directions, not promises of a millisecond duration.
 */
export function compileProsody(spokenText, candidate, { maxTags = 3 } = {}) {
  const text = String(spokenText)
  const proposed = alignPlan(text, candidate)
  const aligned = proposed || rulePlan(text)
  if (!aligned || !text.trim()) {
    return { script: text, prosody: [], prosodySource: 'rules', prosodyStatus: 'fallback', prosodyError: 'invalid-prosody-plan' }
  }
  const units = aligned.units
  const plan = units.map(({ text, intent }) => ({ text, intent, emphasis: '', pauseAfter: 'none', pace: 'normal', delivery: '' }))
  const prefix = units.map(() => '')
  const suffix = units.map(() => '')
  const bodies = units.map((unit) => unit.text)
  let remaining = Math.max(0, Math.min(6, Math.floor(Number(maxTags) || 0)))

  // One stable delivery across the whole reply helps avoid per-sentence resets.
  if (remaining && text.trim().length > 20) {
    plan[0].delivery = '自然地讲解，语气平稳，句子衔接连贯'
    prefix[0] = `[${plan[0].delivery}]`
    remaining--
  }

  // Protect the important condition/limitation first; emphasize at most one span.
  const emphasized = units.map((unit, index) => ({ ...unit, index }))
    .filter((unit) => unit.emphasis)
    .sort((a, b) => PRIORITY[b.intent] - PRIORITY[a.intent] || a.index - b.index)[0]
  if (remaining && emphasized) {
    const { index, emphasis } = emphasized
    bodies[index] = bodies[index].replace(emphasis, () => `<emphasis>${emphasis}</emphasis>`)
    plan[index].emphasis = emphasis
    remaining--
  }

  const paused = units.map((unit, index) => ({ ...unit, index }))
    .filter((unit) => unit.pauseAfter === 'short' && unit.index < units.length - 1)
    .sort((a, b) => PRIORITY[units[b.index + 1].intent] - PRIORITY[units[a.index + 1].intent] || a.index - b.index)[0]
  if (remaining && paused) {
    suffix[paused.index] = '[短暂停顿]'
    plan[paused.index].pauseAfter = 'short'
    remaining--
  }

  // Use a director cue rather than nested paired tags when slowing a sentence.
  const slower = units.map((unit, index) => ({ ...unit, index }))
    .filter((unit) => unit.pace === 'slower')
    .sort((a, b) => Number(b.intent === 'closing') - Number(a.intent === 'closing') || b.index - a.index)[0]
  if (remaining && slower) {
    const delivery = slower.intent === 'closing' ? '稍放缓，自然收尾' : '稍放缓，把这一点说清楚'
    prefix[slower.index] += `[${delivery}]`
    plan[slower.index].pace = 'slower'
    plan[slower.index].delivery = [plan[slower.index].delivery, delivery].filter(Boolean).join('；')
    remaining--
  }

  return {
    script: units.map((unit, index) => `${unit.prefix}${prefix[index]}${bodies[index]}${suffix[index]}`).join('') + aligned.suffix,
    prosody: plan,
    prosodySource: proposed ? 'model' : 'rules',
    prosodyStatus: proposed ? 'applied' : 'fallback',
    prosodyError: proposed ? null : 'invalid-prosody-plan',
  }
}
