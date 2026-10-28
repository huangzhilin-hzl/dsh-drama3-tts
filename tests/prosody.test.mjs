import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compileProsody } from '../prosody.js'

const unit = (text, intent = 'explain', overrides = {}) => ({ text, intent, emphasis: '', pauseAfter: 'none', pace: 'normal', ...overrides })
const plain = (script) => script.replace(/<\/?emphasis>|\[[^\]\n]*\]/g, '')
const cues = (script) => script.match(/<emphasis>|\[[^\]\n]*\]/g) ?? []

describe('sentence prosody compiler', () => {
  it('keeps the exact source and applies a bounded coherent plan', () => {
    const text = 'Humming 的吞吐提高了 13%。但长上下文还没有验证。下一步检查 kernel。'
    const result = compileProsody(text, [
      unit('Humming 的吞吐提高了 13%。', 'explain', { pauseAfter: 'short' }),
      unit('但长上下文还没有验证。', 'caution', { emphasis: '还没有验证' }),
      unit('下一步检查 kernel。', 'next-step'),
    ])
    assert.equal(plain(result.script), text)
    assert.equal(result.prosodySource, 'model')
    assert.equal(cues(result.script).length, 3)
    assert.equal(result.prosody[0].pauseAfter, 'short')
    assert.equal(result.prosody[1].emphasis, '还没有验证')
    assert.match(result.script, /<emphasis>还没有验证<\/emphasis>/)
  })

  it('preserves English spaces across sentence boundaries', () => {
    const text = 'The result is 13%.  But it is unverified.\nCheck the kernel.'
    const result = compileProsody(text, [unit('The result is 13%.'), unit('But it is unverified.', 'caution'), unit('Check the kernel.', 'closing')])
    assert.equal(plain(result.script), text)
    assert.equal(result.prosodySource, 'model')
  })

  it('falls back without accepting changed words, punctuation, numbers, or order', () => {
    const text = '吞吐提高了13%。但长上下文还没有验证。'
    for (const proposed of [
      [unit('吞吐提高了31%。'), unit('但长上下文还没有验证。')],
      [unit('吞吐提高了13%!'), unit('但长上下文还没有验证。')],
      [unit('但长上下文还没有验证。'), unit('吞吐提高了13%。')],
      [unit('吞吐提高了13%。')],
      [unit(text, 'angry')],
      [unit(text, 'explain', { emphasis: '完全验证' })],
      [unit(text, 'explain', { pauseAfter: '10 seconds' })],
      [unit(text, 'explain', { pace: 'very-fast' })],
    ]) {
      const result = compileProsody(text, proposed)
      assert.equal(result.prosodySource, 'rules')
      assert.equal(plain(result.script), text)
      assert.ok(cues(result.script).length <= 3)
    }
  })

  it('does not invent laughs or breaths in deterministic fallback', () => {
    const result = compileProsody('结果还不确定。下一步检查服务。', null)
    assert.equal(result.prosody[0].intent, 'caution')
    assert.equal(result.prosody[1].intent, 'next-step')
    assert.doesNotMatch(result.script, /笑|叹气|呼吸/)
    assert.equal(plain(result.script), '结果还不确定。下一步检查服务。')
  })

  it('does not split decimals or versions while recovering sentences', () => {
    const text = 'Use version 0.1.18 with a 0.95 score. Then compare native.'
    const result = compileProsody(text, null)
    assert.equal(result.prosody.length, 2)
    assert.equal(result.prosody[0].text, 'Use version 0.1.18 with a 0.95 score.')
    assert.equal(plain(result.script), text)
  })

  it('never nests emphasis when the closing sentence slows down', () => {
    const text = '我们已经完成当前这轮检查。最后还需要继续验证。'
    const result = compileProsody(text, [unit('我们已经完成当前这轮检查。'), unit('最后还需要继续验证。', 'closing', { emphasis: '继续验证', pace: 'slower' })])
    assert.equal(result.prosody[1].pace, 'slower')
    assert.match(result.script, /\[稍放缓，自然收尾\].*<emphasis>继续验证<\/emphasis>/)
    assert.equal(plain(result.script), text)
  })

  it('honors zero or small budgets and reports only applied cues', () => {
    const text = '我们先解释这次测试得到的结果。下一步继续验证。'
    const candidate = [unit('我们先解释这次测试得到的结果。', 'explain', { emphasis: '结果', pauseAfter: 'short' }), unit('下一步继续验证。', 'closing', { pace: 'slower' })]
    for (const maxTags of [0, 1, 2, 3, 6]) {
      const result = compileProsody(text, candidate, { maxTags })
      assert.ok(cues(result.script).length <= maxTags)
      assert.equal(plain(result.script), text)
      if (maxTags <= 1) assert.ok(result.prosody.every((row) => !row.emphasis && row.pauseAfter === 'none' && row.pace === 'normal'))
    }
  })

  it('does not apply emphasis to a partial English word', () => {
    const result = compileProsody('Humming works.', [unit('Humming works.', 'explain', { emphasis: 'Hum' })])
    assert.equal(result.prosodySource, 'rules')
    assert.equal(plain(result.script), 'Humming works.')
  })

  it('leaves tiny replies free of forced direction and handles empty replies', () => {
    assert.equal(compileProsody('好。', [unit('好。')]).script, '好。')
    assert.equal(compileProsody('', []).script, '')
  })

  it('treats replacement metacharacters as literal spoken content', () => {
    for (const emphasis of ['$`', "$'", '$$', '$&']) {
      const text = `This syntax uses ${emphasis} in the expression.`
      const result = compileProsody(text, [unit(text, 'explain', { emphasis })])
      assert.equal(plain(result.script), text)
      assert.ok(result.script.includes(`<emphasis>${emphasis}</emphasis>`))
    }
  })

  it('rejects model sentence breaks inside an English word or identifier', () => {
    const text = 'Compare Humming with native before changing the kernel.'
    const result = compileProsody(text, [
      unit('Compare Hum', 'explain', { pauseAfter: 'short' }),
      unit('ming with native before changing the kernel.', 'closing'),
    ])
    assert.equal(result.prosodySource, 'rules')
    assert.equal(plain(result.script), text)
    assert.match(result.script, /Humming/)
    const chinese = compileProsody('这次尚未验证。', [unit('这次尚', 'explain', { pauseAfter: 'short' }), unit('未验证。', 'caution')])
    assert.equal(chinese.prosodySource, 'rules')
    assert.equal(plain(chinese.script), '这次尚未验证。')
  })

  it('keeps technical abbreviations within the same fallback sentence', () => {
    for (const text of [
      'Compare Humming vs. native before changing the kernel.',
      'Use an example, e.g. the native kernel.',
      'Check the units, i.e. milliseconds.',
      'Read the U.S. release notes.',
    ]) {
      const result = compileProsody(text, null)
      assert.equal(result.prosody.length, 1)
      assert.doesNotMatch(result.script, /自然收尾/)
      assert.equal(plain(result.script), text)
    }
  })
})
