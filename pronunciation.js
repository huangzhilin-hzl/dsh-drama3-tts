/**
 * Compile verified speech text into Drama 3 pronunciation controls.
 * Ordinary English entries use CMUdict (Carnegie Mellon University):
 * https://github.com/cmusphinx/cmudict . Brand/acronym readings are explicit
 * preferences, not inferred by the text model, and can be overridden locally.
 */
const phoneme = (term, phones, reading) => ({ term, phones, reading, kind: 'phoneme' })
const alias = (term, reading) => ({ term, reading, kind: 'alias' })

const BUILT_INS = [
  phoneme('Humming', 'HH AH1 M IH0 NG', '/ˈhʌmɪŋ/'),
  phoneme('native', 'N EY1 T IH0 V', '/ˈneɪtɪv/'),
  phoneme('eager', 'IY1 G ER0', '/ˈiːɡər/'),
  phoneme('kernel', 'K ER1 N AH0 L', '/ˈkɜːrnəl/'),
  phoneme('CUTLASS', 'K AH1 T L AH0 S', '/ˈkʌtləs/'),
  phoneme('cache', 'K AE1 SH', '/kæʃ/'),
  phoneme('decode', 'D IH0 K OW1 D', '/dɪˈkoʊd/'),
  phoneme('batch', 'B AE1 CH', '/bætʃ/'),
  phoneme('CUDA', 'K UW1 D AH0', '/ˈkuːdə/'),
  phoneme('GEMM', 'JH EH1 M', '/dʒɛm/'),
  alias('prefill', 'pre fill'),
  alias('MoE', 'M O E'),
  alias('GPU', 'G P U'),
  alias('CPU', 'C P U'),
  alias('TPOT', 'T P O T'),
  alias('TTFT', 'T T F T'),
  alias('API', 'A P I'),
  alias('CI', 'C I'),
  alias('KV', 'K V'),
  alias('GSM8K', 'G S M 8 K'),
  alias('sglang', 'S G Lang'),
]

function parseLexicon(value) {
  if (typeof value !== 'string' || value.length > 16000) return { error: 'invalid-pronunciation-lexicon' }
  const entries = []
  const seen = new Set()
  for (const source of value.split(/\r?\n/u)) {
    const line = source.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) return { error: 'invalid-pronunciation-lexicon' }
    const term = line.slice(0, separator).trim()
    const reading = line.slice(separator + 1).trim()
    if (!term || !reading || term.length > 80 || reading.length > 160
      || /[<>\[\]{}=\u0000-\u001f\u007f]/u.test(term + reading)
      || !/[\p{L}\p{N}]/u.test(term) || !/[\p{L}\p{N}]/u.test(reading)
      || seen.has(term.toLowerCase())) return { error: 'invalid-pronunciation-lexicon' }
    seen.add(term.toLowerCase())
    entries.push(alias(term, reading))
    if (entries.length > 100) return { error: 'invalid-pronunciation-lexicon' }
  }
  return { entries }
}

export function validatePronunciationLexicon(value) {
  return parseLexicon(value).error ?? null
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Never rewrite instructions, recurse through aliases, or guess unknown words. */
export function applyPronunciations(script, { enabled = true, lexicon = '' } = {}) {
  const source = String(script)
  if (!enabled) return { synthesisText: source, pronunciationChanges: [] }
  const parsed = parseLexicon(lexicon)
  if (parsed.error) throw new Error(parsed.error)
  const rules = new Map(BUILT_INS.map((entry) => [entry.term.toLowerCase(), entry]))
  for (const entry of parsed.entries) rules.set(entry.term.toLowerCase(), entry)
  const alternatives = [...rules.values()].sort((a, b) => b.term.length - a.term.length)
    .map((entry) => escapeRegExp(entry.term))
  const matcher = new RegExp(`(?<![A-Za-z0-9_])(?:${alternatives.join('|')}|W\\d{1,3}A\\d{1,3}|(?:BF|FP|INT)\\d{1,3})(?![A-Za-z0-9_])`, 'giu')
  const chinese = /[\p{Script=Han}]/u.test(source.replace(/<[^>]*>|\[[^\]\n]*\]/g, ''))
  const pronunciationChanges = []
  const used = new Set()
  const replace = (match) => {
    let entry = rules.get(match.toLowerCase())
    if (!entry) {
      const precision = /^W(\d+)A(\d+)$/i.exec(match)
      entry = alias(match, precision
        ? chinese ? `权重 ${precision[1]} 位、激活 ${precision[2]} 位` : `W ${precision[1]} A ${precision[2]}`
        : match.replace(/([A-Za-z])(?=[A-Za-z\d])/g, '$1 '))
    }
    if (!used.has(match.toLowerCase())) {
      used.add(match.toLowerCase())
      pronunciationChanges.push({ term: match, reading: entry.reading, kind: entry.kind })
    }
    return entry.kind === 'phoneme'
      ? `<|phoneme_start|>${entry.phones}<|phoneme_end|>`
      : entry.reading
  }
  // Preserve complete phoneme spans first, then any director/control token.
  const tokens = source.split(/(<\|phoneme_start\|>[\s\S]*?<\|phoneme_end\|>|<[^>]*>|\[[^\]\n]*\])/g)
  const synthesisText = tokens.map((token, index) => index % 2 ? token : token.replace(matcher, replace)).join('')
  return { synthesisText, pronunciationChanges }
}
