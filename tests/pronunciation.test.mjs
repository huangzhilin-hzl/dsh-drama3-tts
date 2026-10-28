import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyPronunciations, validatePronunciationLexicon } from '../pronunciation.js'

describe('technical pronunciation compiler', () => {
  it('pins English words without changing numeric evidence or director tags', () => {
    const result = applyPronunciations('[用 native 的节奏]Humming 比 native 慢 13%，<emphasis>kernel</emphasis> 尚未验证。')
    assert.ok(result.synthesisText.startsWith('[用 native 的节奏]<|phoneme_start|>HH AH1 M IH0 NG<|phoneme_end|>'))
    assert.match(result.synthesisText, /13%/)
    assert.match(result.synthesisText, /<emphasis><\|phoneme_start\|>K ER1 N AH0 L<\|phoneme_end\|><\/emphasis>/)
    assert.deepEqual(result.pronunciationChanges.map((entry) => entry.term), ['Humming', 'native', 'kernel'])
  })

  it('spells acronyms and verbalizes precision only after editing', () => {
    const result = applyPronunciations('MoE 用 W4A16，GPU 对照 FP8 和 BF16。')
    assert.equal(result.synthesisText, 'M O E 用 权重 4 位、激活 16 位，G P U 对照 F P 8 和 B F 16。')
    assert.equal(applyPronunciations('Compare W4A16 with W4A8.').synthesisText, 'Compare W 4 A 16 with W 4 A 8.')
  })

  it('matches whole terms, preserving identifiers and unknown product names', () => {
    assert.equal(applyPronunciations('native_impl Hummingbird CUDA12 myGPU ExperimentalFoo').synthesisText,
      'native_impl Hummingbird CUDA12 myGPU ExperimentalFoo')
    assert.match(applyPronunciations('CUDA的kernel').synthesisText, /<\|phoneme_start\|>K UW1 D AH0<\|phoneme_end\|>的<\|phoneme_start\|>/)
  })

  it('gives longest custom phrases priority, without recursively replacing aliases', () => {
    const result = applyPronunciations('KV cache 与 Humming。', { lexicon: 'KV cache = K V 缓存\nHumming = native' })
    assert.equal(result.synthesisText, 'K V 缓存 与 native。')
    assert.deepEqual(result.pronunciationChanges, [
      { term: 'KV cache', reading: 'K V 缓存', kind: 'alias' },
      { term: 'Humming', reading: 'native', kind: 'alias' },
    ])
  })

  it('keeps compiled spans intact and reports each term only once', () => {
    const result = applyPronunciations('<|phoneme_start|>N EY1 T IH0 V<|phoneme_end|> native native')
    assert.equal((result.synthesisText.match(/<\|phoneme_start\|>/g) ?? []).length, 3)
    assert.equal(result.pronunciationChanges.length, 1)
  })

  it('can be disabled without touching the script', () => {
    assert.deepEqual(applyPronunciations('GPU Humming W4A16', { enabled: false }), {
      synthesisText: 'GPU Humming W4A16', pronunciationChanges: [],
    })
  })

  it('accepts comment lines and rejects malformed or injectable dictionaries', () => {
    assert.equal(validatePronunciationLexicon('# 我的读法\nKV cache = K V 缓存\n'), null)
    for (const invalid of ['GPU', '= 读法', 'GPU =', 'GPU = [laugh]', 'GPU = <|phoneme_start|>G',
      'GPU = A\ngpu = B', 'GPU = A=B', 'GPU = hi\u0000', '= =', 'a'.repeat(16001),
      Array.from({ length: 101 }, (_, i) => `term${i} = 词`).join('\n')]) {
      assert.equal(validatePronunciationLexicon(invalid), 'invalid-pronunciation-lexicon', invalid)
    }
  })
})
