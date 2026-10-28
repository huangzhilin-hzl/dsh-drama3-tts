/** Conservative opening checks, not full-transcript pronunciation scoring. */
const PAIRED_DIRECTION = /<\/?(?:emphasis|whisper|soft|fast|slow|stress|forceful)>/g
const HAN = /^\p{Script=Han}+$/u
const FILLER = /^[嗯啊呃哦唔诶欸哎]{1,2}$/u

function stripDirections(source) {
  let valid = true
  const stack = []
  const withoutStage = source.replace(/\[([^\]\n]*)\]/gu, (token, direction) => {
    const legal = direction.trim().length > 0 && Array.from(direction).length <= 60
      && !/[<>\[\]{}\u0000-\u001f\u007f]/u.test(direction)
    if (!legal) valid = false
    return legal ? '' : token
  })
  const withoutPaired = withoutStage.replace(PAIRED_DIRECTION, (token) => {
    const name = token.replace(/[<>/]/g, '')
    if (token.startsWith('</')) {
      if (stack.pop() !== name) valid = false
    } else {
      // Match the script validator: known pairs are balanced and not nested.
      if (stack.length) valid = false
      stack.push(name)
    }
    return ''
  })
  if (!valid || stack.length) return null
  return withoutPaired
}

/**
 * Only a Chinese first sentence supplies an anchor. Mixed language, numbers,
 * pronunciation controls and short greetings are deliberately left unchecked.
 * For sentences longer than 40 Han characters, check the first 24: this detects
 * a lost opening without making a long sentence's later ASR errors decisive.
 */
export function openingAnchor(text) {
  if (typeof text !== 'string') return null
  const plain = stripDirections(text.normalize('NFKC'))
  if (plain === null) return null
  const first = plain.split(/[。！？.!?]/u, 1)[0]
  // Chinese punctuation can normalize to ASCII. Do not erase unknown tags or
  // English here: doing so could promote a later Chinese phrase to the opening.
  if (!/^[\p{Script=Han}\s，,、:：;；“”‘’「」『』()（）《》〈〉—…·]+$/u.test(first)) return null
  const chars = Array.from(first.replace(/[^\p{Script=Han}]/gu, ''))
  if (chars.length < 6) return null
  return chars.slice(0, chars.length > 40 ? 24 : 40).join('')
}

function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row++) {
    const current = [row]
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + Number(left[row - 1] !== right[column - 1]),
      )
    }
    previous = current
  }
  return previous[right.length]
}

/**
 * Compare only the actual transcript opening, allowing at most two filler
 * characters and 1–2 recognition edits. Later technical words are irrelevant.
 * Inputs remain data: no JSON parsing, template evaluation or instruction use.
 */
export function openingMatches(anchor, transcript) {
  if (typeof anchor !== 'string' || typeof transcript !== 'string') return false
  const expected = Array.from(anchor.normalize('NFKC'))
  if (expected.length < 6 || expected.length > 40 || !HAN.test(expected.join(''))) return false
  const tolerance = Math.min(2, Math.max(1, Math.floor(expected.length * 0.15)))
  // Preserve Latin, digits and symbols. Removing them would turn "MoE ..."
  // into a different apparent starting point and hide the original omission.
  const actual = Array.from(transcript.normalize('NFKC').replace(/[\p{P}\s]/gu, ''))
    .slice(0, expected.length + tolerance + 2)
  let fillers = 0
  while (FILLER.test(actual[fillers] || '')) fillers++
  // Do not add the recognition-error budget to the two-character filler
  // budget: three initial fillers must not pass as two fillers plus one edit.
  if (fillers > 2 && !FILLER.test(expected[0])) return false
  for (let offset = 0; offset <= 2; offset++) {
    if (offset && !FILLER.test(actual.slice(0, offset).join(''))) continue
    for (let length = expected.length - tolerance; length <= expected.length + tolerance; length++) {
      const candidate = actual.slice(offset, offset + length)
      if (candidate.length !== length || !HAN.test(candidate.join(''))) continue
      if (editDistance(expected, candidate) <= tolerance) return true
    }
  }
  return false
}
