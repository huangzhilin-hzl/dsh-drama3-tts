/**
 * Browser-half tests for dsh-drama3-tts.
 *
 * The file is a lazy client module, so the test installs the loader shim the
 * Web client provides, executes the factory against the real React build and
 * renders each contribution with `react-dom/server`. That catches a broken
 * export shape, a missing slot registration and any render-time crash without
 * a browser.
 *
 *   node --test tests/host.test.mjs tests/client.test.mjs
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'

const webRequire = createRequire(import.meta.url)
const React = webRequire('react')
const { renderToStaticMarkup } = webRequire('react-dom/server')

// The Web client exposes the lazy-module loader on `window`; capture the module.
let module_ = null
globalThis.window = {
  ...globalThis.window,
  localStorage: {
    store: new Map(),
    getItem(key) {
      return this.store.has(key) ? this.store.get(key) : null
    },
    setItem(key, value) {
      this.store.set(key, String(value))
    },
  },
  __ModuleLoader__: {
    load(config) {
      module_ = config
    },
  },
  addEventListener: () => {},
  removeEventListener: () => {},
}

const headChildren = []
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', textContent: '', remove() {} }),
  head: { appendChild: (node) => headChildren.push(node) },
}

await import('../client.js')
assert.notEqual(module_, null, 'client.js must register itself with the module loader')

const plugin = module_.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require: ${id}`)
})

/** Minimal Cordis client context: records slots and dictionaries. */
function createContext() {
  const registrations = []
  const injected = []
  let dictionaries = null
  const ctx = {
    effect: (fn) => {
      const dispose = fn()
      return () => dispose?.()
    },
    on: () => () => {},
    locale: {
      register: (_ns, dicts) => {
        dictionaries = dicts
        return () => {}
      },
      bind: () => (key) => key,
      getLocale: () => ({ active: 'zh' }),
    },
    slots: {
      inject: (name, factory) => {
        injected.push(name)
        factory()
        return () => {}
      },
      register: (options, component) => {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
  return { ctx, registrations, injected, dictionaries: () => dictionaries }
}

const t = (key) => key

describe('plugin shape', () => {
  it('exports the name, injected services and apply', () => {
    assert.equal(plugin.name, 'drama3-tts')
    assert.deepEqual(plugin.inject, ['slots', 'locale'])
    assert.equal(typeof plugin.apply, 'function')
  })

  it('registers the four contributions and both dictionaries', () => {
    const { ctx, registrations, injected, dictionaries } = createContext()
    plugin.apply(ctx)
    assert.deepEqual(injected.sort(),
      ['conversation.chat.assistant-actions', 'conversation.input.dock', 'conversation.input.left', 'settings.section'])
    assert.deepEqual(registrations.map((entry) => entry.options.name).sort(),
      ['conversation.chat.assistant-actions', 'conversation.input.dock', 'conversation.input.left', 'settings.section'])
    const dicts = dictionaries()
    assert.notEqual(dicts, null)
    assert.deepEqual(Object.keys(dicts.zh).sort(), Object.keys(dicts.en).sort(), 'zh and en must share every key')
    assert.equal(typeof registrations.find((entry) => entry.options.name === 'settings.section').options.label(), 'string')
  })
})

describe('rendering', () => {
  const component = (name) => {
    const { ctx, registrations } = createContext()
    plugin.apply(ctx)
    return registrations.find((entry) => entry.options.name === name).component
  }

  const idlePlayer = {
    subscribe: () => () => {},
    get: () => ({ status: 'idle', messageId: null }),
    stop: () => {},
  }

  it('renders the composer toggle in both states', () => {
    const ComposerToggle = component('conversation.input.left')
    const props = (read, player = idlePlayer) => ({
      t,
      read: () => read,
      set: () => {},
      subscribe: () => () => {},
      player,
      unlock: () => {},
    })
    const on = renderToStaticMarkup(React.createElement(ComposerToggle, props(true)))
    const off = renderToStaticMarkup(React.createElement(ComposerToggle, props(false)))
    assert.match(on, /aria-pressed="true"/)
    assert.match(off, /aria-pressed="false"/)
    assert.match(on, /<svg/)
    assert.equal(off.includes('drama3-tts-bars'), false)
  })

  it('switches to the animated bars while a reply is being read', () => {
    const ComposerToggle = component('conversation.input.left')
    const reading = {
      subscribe: () => () => {},
      get: () => ({ status: 'speaking', messageId: 'm1' }),
      stop: () => {},
    }
    const html = renderToStaticMarkup(React.createElement(ComposerToggle, {
      t,
      read: () => true,
      set: () => {},
      subscribe: () => () => {},
      player: reading,
      unlock: () => {},
    }))
    assert.match(html, /drama3-tts-bars/)
    assert.match(html, /data-drama3-tts-reading="true"/)
    assert.match(html, /aria-label="input.playing"/)
  })

  const player = {
    speak: async () => {},
    stop: () => {},
    pendingFor: () => false,
    playingFor: () => false,
    subscribe: () => () => {},
  }

  const snapshot = (blocks) => ({
    legacy: {
      nodes: [{
        kind: 'assistant',
        messageId: 'm1',
        blocks,
        time: 2000,
        turn: 1,
        step: 1,
        seq: 1,
      }],
    },
  })

  const renderAction = (blocks) => {
    const Actions = component('conversation.chat.assistant-actions')
    return renderToStaticMarkup(React.createElement(Actions, {
      t,
      messageId: 'm1',
      player,
      autoRead: () => false,
      loadTime: 1000,
      played: new Set(),
      useChat: (selector) => selector(snapshot(blocks)),
    }))
  }

  it('renders a speaker button for a reply with text', () => {
    const html = renderAction([{ kind: 'text', text: '你好，世界。' }])
    assert.match(html, /data-drama3-tts="m1"/)
    assert.match(html, /aria-label="action.speak.aria"/)
    assert.match(html, /<svg/)
  })

  it('renders nothing when the reply has no text block', () => {
    assert.equal(renderAction([{ kind: 'reasoning', text: 'thinking' }]), '')
  })

  it('keeps the docked player out of the layout while idle', () => {
    const PlaybackBar = component('conversation.input.dock')
    const idle = { subscribe: () => () => {}, get: () => ({ status: 'idle', bars: [], clip: null }), pause: () => {}, resume: () => {}, seek: () => {}, stop: () => {} }
    const html = renderToStaticMarkup(React.createElement(PlaybackBar, { t, player: idle }))
    assert.equal(html, '')
  })

  it('shows each playback transport only in its owning conversation or settings preview', () => {
    const PlaybackBar = component('conversation.input.dock')
    const state = { status: 'speaking', messageId: 'reply', sessionId: 'session-a', clips: [], bars: [], warnings: [] }
    const player = { subscribe: () => () => {}, get: () => state, retry: async () => {}, stop: () => {} }
    const render = (props = {}) => renderToStaticMarkup(React.createElement(PlaybackBar, { t, player, ...props }))
    assert.match(render({ sessionId: 'session-a' }), /data-drama3-tts-player/)
    assert.equal(render({ sessionId: 'session-b' }), '', 'an unrelated side chat must not grow a duplicate player')
    assert.equal(render({ surface: 'preview' }), '', 'ordinary chat playback stays out of the settings preview')
    state.messageId = 'drama3-tts:preview'
    state.sessionId = null
    assert.match(render({ surface: 'preview' }), /data-drama3-tts-player/)
    assert.equal(render({ sessionId: 'session-a' }), '', 'settings preview must not occupy a conversation dock')
  })

  it('releases the conversation dock on completion while preserving active states and preview results', async () => {
    const { create, act } = webRequire('react-test-renderer')
    const PlaybackBar = component('conversation.input.dock')
    const listeners = new Set()
    let state = {
      status: 'speaking', messageId: 'reply', sessionId: 'session-a', paused: false,
      clips: [new Blob(['audio'], { type: 'audio/wav' })], bars: [0.5], warnings: [], script: '第一句话。',
    }
    const player = {
      subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
      get: () => state, stop: () => {}, retry: async () => {}, pause: () => {}, resume: () => {}, seek: () => {},
    }
    const update = (patch) => {
      state = { ...state, ...patch }
      for (const listener of listeners) listener()
    }
    const revoked = []
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    let nextUrl = 0
    URL.createObjectURL = () => `blob:clip-${++nextUrl}`
    URL.revokeObjectURL = (url) => revoked.push(url)
    let view
    const hasPlayer = () => view.root.findAllByProps({ 'data-drama3-tts-player': true }).length > 0
    const scriptButton = () => view.root.findAllByType('button')
      .find((node) => node.children.some((child) => ['player.viewScript', 'player.hideScript'].includes(child)))
    try {
      await act(async () => { view = create(React.createElement(PlaybackBar, { t, player, sessionId: 'session-a' })) })
      assert.equal(hasPlayer(), true)
      assert.equal(view.root.findAllByType('a').length, 0, 'downloads should not occupy the collapsed player')
      await act(async () => scriptButton().props.onClick())
      const clipUrl = view.root.findByType('a').props.href
      assert.equal(scriptButton().props['aria-expanded'], true)
      assert.ok(scriptButton().children.includes('player.hideScript'))
      for (const patch of [{ status: 'buffering' }, { status: 'speaking', paused: true }, { status: 'error', error: 'upstream-failed' }]) {
        await act(async () => update(patch))
        assert.equal(hasPlayer(), true, 'waiting, paused and failed playback must remain controllable')
      }
      await act(async () => update({ status: 'done', paused: false, error: null }))
      assert.equal(hasPlayer(), false, 'completed conversation playback must release all dock space')
      assert.ok(revoked.includes(clipUrl), 'hidden playback must release its download URL')
      await act(async () => update({ status: 'planning', messageId: 'next-reply', clips: [], script: '' }))
      assert.equal(hasPlayer(), true)
      await act(async () => update({ status: 'speaking', script: '下一句话。' }))
      assert.equal(scriptButton().props['aria-expanded'], false, 'the next read starts with its script collapsed')
      await act(async () => {
        update({ status: 'done', messageId: 'drama3-tts:preview', sessionId: null,
          clips: [new Blob(['preview'], { type: 'audio/wav' })] })
        view.update(React.createElement(PlaybackBar, { t, player, surface: 'preview' }))
      })
      assert.equal(hasPlayer(), true, 'settings retains the completed audition for review and download')
      assert.equal(view.root.findAllByType('a').length, 0)
      await act(async () => scriptButton().props.onClick())
      assert.equal(view.root.findAllByType('a').length, 1)
    } finally {
      if (view) await act(async () => view.unmount())
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
    }
  })

  it('renders the settings loading state without a backend', () => {
    const Settings = component('settings.section')
    const player = { subscribe: () => () => {}, get: () => ({ status: 'idle' }), speak: async () => {}, stop: () => {}, pause: () => {}, resume: () => {}, seek: () => {} }
    const html = renderToStaticMarkup(React.createElement(Settings, { t, close: () => {}, engine: { unlock: () => {}, play: async () => {}, state: () => 'none', sampleRate: () => 0 }, player }))
    assert.match(html, /settings.status.checking/)
  })
})

// Exercise the actual player returned through the settings contribution. The
// audio device is replaced, but requests and session transitions are real.
describe('playback sessions', () => {
  const setup = () => {
    const { ctx, registrations } = createContext()
    plugin.apply(ctx)
    const { player, engine } = registrations.find((entry) => entry.options.name === 'settings.section').options.inject()
    engine.play = async (_audio, _control, report) => {
      report?.({ kind: 'ready', bars: [0.5], duration: 2 })
      report?.({ kind: 'tick', time: 2, duration: 2, paused: false })
    }
    engine.unlock = () => {}
    return { player, engine }
  }
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const audio = (type = 'audio/wav') => new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': type } })
  const plan = (segments = ['第一段。']) => ({ segments, script: '[轻笑]第一段。', spokenText: '第一段。', cleanedText: '原回复第一段。', summarized: true, tagged: true, warnings: [] })
  const deferred = () => {
    let resolve
    const promise = new Promise((done) => { resolve = done })
    return { promise, resolve }
  }

  it('keeps the originating session when retrying a failed read', async () => {
    const { player } = setup()
    const originalFetch = globalThis.fetch
    let fail = true
    globalThis.fetch = async (url) => url.endsWith('/plan') ? json(plan())
      : fail ? json({ ok: false, error: 'upstream-failed' }, 502) : audio()
    try {
      await assert.rejects(player.speak('m1', '原回复。', [], null, 'session-a'))
      assert.equal(player.get().sessionId, 'session-a')
      assert.equal(player.get().status, 'error')
      fail = false
      await player.retry()
      assert.equal(player.get().status, 'done')
      assert.equal(player.get().sessionId, 'session-a')
      player.stop()
      assert.equal(player.get().sessionId, null)
    } finally { globalThis.fetch = originalFetch }
  })

  it('aborts planning and ignores a late response after stop', async () => {
    const { player } = setup()
    const originalFetch = globalThis.fetch
    const gate = deferred()
    const calls = []
    globalThis.fetch = (url, options) => { calls.push({ url, options }); return gate.promise }
    try {
      const speaking = player.speak('old', '旧回复。')
      assert.equal(player.get().status, 'planning')
      player.stop()
      assert.equal(calls[0].options.signal.aborted, true)
      gate.resolve(json(plan()))
      await speaking
      assert.equal(player.get().status, 'idle')
      assert.equal(calls.length, 1, 'cancelled planning must not request speech')
    } finally { globalThis.fetch = originalFetch }
  })

  it('keeps a new session intact when an older plan completes last', async () => {
    const { player } = setup()
    const originalFetch = globalThis.fetch
    const old = deferred()
    const calls = []
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body)
      calls.push({ url, body })
      if (url.endsWith('/speech')) return audio()
      return body.text === '旧回复。' ? old.promise : json(plan(['新回复。']))
    }
    try {
      const stale = player.speak('old', '旧回复。')
      await player.speak('new', '新回复。')
      old.resolve(json(plan(['旧回复。'])))
      await stale
      assert.equal(player.get().messageId, 'new')
      assert.equal(player.get().status, 'done')
      assert.deepEqual(calls.filter((call) => call.url.endsWith('/speech')).map((call) => call.body.text), ['新回复。'])
    } finally { globalThis.fetch = originalFetch }
  })

  it('retains every segment and the prepared script when playback finishes', async () => {
    const { player } = setup()
    const originalFetch = globalThis.fetch
    const requests = []
    const context = [{ role: 'user', content: '请简短说明。' }]
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options })
      return url.endsWith('/plan') ? json({ ...plan(['第一段。', '第二段。']), warnings: ['tags-rejected'] }) : audio()
    }
    try {
      await player.speak('m1', '原回复。', context)
      const state = player.get()
      assert.equal(state.status, 'done')
      assert.equal(state.clips.length, 2)
      assert.equal(state.clips[0].type, 'audio/wav')
      assert.equal(state.segment, 2)
      assert.equal(state.script, '[轻笑]第一段。')
      assert.equal(state.summarized, true)
      assert.deepEqual(state.warnings, ['tags-rejected'])
      assert.deepEqual(JSON.parse(requests[0].options.body).context, context)
      assert.ok(requests.every(({ options }) => options.signal instanceof AbortSignal))
    } finally { globalThis.fetch = originalFetch }
  })

  it('reports a prefetched failure without an unhandled rejection or hiding the script', async () => {
    const { player, engine } = setup()
    const originalFetch = globalThis.fetch
    const playback = deferred()
    const unhandled = []
    const onUnhandled = (error) => unhandled.push(error)
    process.on('unhandledRejection', onUnhandled)
    engine.play = () => playback.promise
    globalThis.fetch = async (url, options) => {
      if (url.endsWith('/plan')) return json(plan(['第一段。', '第二段。']))
      return JSON.parse(options.body).text === '第一段。' ? audio() : json({ ok: false, error: 'upstream-failed' }, 502)
    }
    try {
      const speaking = player.speak('m1', '原回复。')
      const rejected = assert.rejects(speaking, (error) => error.code === 'upstream-failed')
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(player.get().status, 'speaking')
      assert.deepEqual(unhandled, [])
      playback.resolve()
      await rejected
      assert.equal(player.get().status, 'error')
      assert.equal(player.get().error, 'upstream-failed')
      assert.equal(player.get().clips.length, 1)
      assert.equal(player.get().script, '[轻笑]第一段。')
    } finally {
      process.off('unhandledRejection', onUnhandled)
      globalThis.fetch = originalFetch
    }
  })

  it('stops the current audio and cancels its prefetched request', async () => {
    const { player, engine } = setup()
    const originalFetch = globalThis.fetch
    const playing = deferred()
    let stopped = false
    let nextSignal
    engine.play = (_blob, control) => new Promise((resolve) => {
      control.stop = () => { stopped = true; resolve() }
      playing.resolve()
    })
    globalThis.fetch = async (url, options) => {
      if (url.endsWith('/plan')) return json(plan(['第一段。', '第二段。']))
      if (JSON.parse(options.body).text === '第一段。') return audio()
      nextSignal = options.signal
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError'))))
    }
    try {
      const speaking = player.speak('m1', '原回复。')
      await playing.promise
      player.stop()
      await speaking
      assert.equal(stopped, true)
      assert.equal(nextSignal.aborted, true)
      assert.equal(player.get().status, 'idle')
    } finally { globalThis.fetch = originalFetch }
  })
})

it('shows readable playback errors with an explicit retry action and no obsolete playback controls', async () => {
  const { create, act } = webRequire('react-test-renderer')
  const { ctx, registrations, dictionaries } = createContext()
  plugin.apply(ctx)
  const PlaybackBar = registrations.find((entry) => entry.options.name === 'conversation.input.dock').component
  const translate = (key) => dictionaries().zh[key] ?? key
  const renderedText = (node) => typeof node === 'string' ? node : (node.children ?? []).map(renderedText).join('')
  for (const [error, expected] of [
    ['reference-text-required', /逐字稿/],
    ['upstream-unreachable', /语音服务暂未连接/],
  ]) {
    const state = { status: 'error', error, script: '上一段朗读稿。', warnings: [], clips: [], bars: [],
      total: 2, segment: 1, synthesisMode: 'segmented' }
    let retries = 0
    let stops = 0
    const player = { subscribe: () => () => {}, get: () => state, retry: async () => { retries++ }, stop: () => { stops++ } }
    let view
    try {
      await act(async () => { view = create(React.createElement(PlaybackBar, { player, t: translate })) })
      assert.match(renderedText(view.root.findByProps({ role: 'alert' })), expected)
      const controls = view.root.findAllByType('button')
      const retryButton = controls.find((node) => node.children.includes('重试'))
      assert.ok(retryButton, 'retry must have a visible text label')
      assert.equal(controls.length, 2, 'the error state exposes retry and close, not a play circle or script action')
      assert.doesNotMatch(JSON.stringify(view.toJSON()), /查看朗读内容|收起朗读内容|第 1 \/ 2 段|整段|分段/)
      await act(async () => retryButton.props.onClick())
      assert.equal(retries, 1)
      await act(async () => controls.find((node) => node.props['aria-label'] === '停止朗读').props.onClick())
      assert.equal(stops, 1)
    } finally { if (view) await act(async () => view.unmount()) }
  }
})

describe('settings interactions', () => {
  const { create, act } = webRequire('react-test-renderer')
  const config = {
    provider: 'local', baseUrl: 'http://127.0.0.1:18190', model: '/home/models/drama-3',
    refAudioPath: '/reference.wav', refText: '参考录音。', hasApiKey: false, hasTagApiKey: false,
    voiceId: 'fbe02f8306fc4d3d915e9871722a39d5', speed: 1, format: 'wav', maxChars: 180,
    summaryEnabled: true, summaryMaxChars: 220, tagEnabled: true, tagMax: 3,
    pronunciationEnabled: true, pronunciationLexicon: '', wholeReplyEnabled: true,
    tagMode: 'strip', tagBaseUrl: 'http://127.0.0.1:18188/v1', tagModel: 'text-model',
  }
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const getSettings = () => {
    const { ctx, registrations, dictionaries } = createContext()
    plugin.apply(ctx)
    const entry = registrations.find((entry) => entry.options.name === 'settings.section')
    const injected = entry.options.inject()
    injected.engine.unlock = () => {}
    injected.engine.play = async () => {}
    return { Settings: entry.component, ...injected, translate: (key) => dictionaries().zh[key] ?? key }
  }
  const button = (view, label) => view.root.findAllByType('button').find((node) => node.children.includes(label))

  it('stops an active preview when settings closes without stopping ordinary conversation playback', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      if (url.endsWith('/voices')) return json({ voices: [] })
      if (url.endsWith('/speech')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } })
      return json({ config })
    }
    try {
      for (const preview of [true, false]) {
        const { Settings, engine, player } = getSettings()
        engine.play = async (_audio, control) => new Promise((resolve) => { control.stop = resolve })
        let view
        let speaking
        try {
          await act(async () => { view = create(React.createElement(Settings, { t, engine, player })) })
          await act(async () => {
            speaking = player.speak(preview ? 'drama3-tts:preview' : 'ordinary-reply', '你好。', [],
              { segments: ['你好。'], script: '你好。', warnings: [] }, preview ? null : 'session-a')
            await new Promise((resolve) => setImmediate(resolve))
          })
          assert.equal(player.get().status, 'speaking')
          await act(async () => { view.unmount(); view = null })
          assert.equal(player.get().status, preview ? 'idle' : 'speaking')
        } finally {
          if (view) await act(async () => view.unmount())
          player.stop()
          await speaking
        }
      }
    } finally { globalThis.fetch = originalFetch }
  })

  it('does not synthesize or clear edits when saving before preview fails', async () => {
    const originalFetch = globalThis.fetch
    const { Settings, engine, player } = getSettings()
    const calls = []
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, method: options.method ?? 'GET' })
      if (url.endsWith('/voices')) return json({ voices: [] })
      if (options.method === 'POST') return json({ ok: false, error: 'invalid-base-url' }, 400)
      return json({ config })
    }
    let view
    try {
      await act(async () => { view = create(React.createElement(Settings, { t, engine, player })) })
      await act(async () => { await button(view, 'settings.previewAction').props.onClick() })
      assert.ok(view.root.findAllByProps({ role: 'alert' }).some((node) => node.children.join('').includes('invalid-base-url')))
      assert.equal(calls.filter((call) => call.url.endsWith('/plan') || call.url.endsWith('/speech')).length, 0)
      assert.equal(player.get().status, 'idle')
    } finally {
      if (view) await act(async () => view.unmount())
      globalThis.fetch = originalFetch
    }
  })

  it('plays exactly the previewed script without generating a second plan', async () => {
    const originalFetch = globalThis.fetch
    const { Settings, engine, player } = getSettings()
    const calls = []
    const prepared = {
      script: '[坦诚又有些无奈]先用 <emphasis>参考录音</emphasis> 对比。',
      spokenText: '先用参考录音对比。', cleanedText: '更长的原始回复。',
      segments: ['[坦诚又有些无奈]先用 <emphasis>参考录音</emphasis> 对比。'],
      summarized: true, tagged: true, warnings: [],
    }
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, body: options.body ? JSON.parse(options.body) : null })
      if (url.endsWith('/voices')) return json({ voices: [] })
      if (url.endsWith('/plan')) return json(prepared)
      if (url.endsWith('/speech')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } })
      return json({ config })
    }
    let view
    try {
      await act(async () => { view = create(React.createElement(Settings, { t, engine, player })) })
      await act(async () => { await button(view, 'settings.prepare').props.onClick() })
      assert.ok(view.root.findAllByType('mark').some((node) => node.children.includes('[坦诚又有些无奈]')))
      await act(async () => { await button(view, 'settings.previewAction').props.onClick() })
      assert.equal(calls.filter((call) => call.url.endsWith('/plan')).length, 1)
      assert.equal(calls.find((call) => call.url.endsWith('/speech')).body.text, prepared.segments[0])
      assert.equal(player.get().status, 'done')
    } finally {
      if (view) await act(async () => view.unmount())
      globalThis.fetch = originalFetch
    }
  })

  it('saves technical pronunciation and custom readings without switching the local model', async () => {
    const originalFetch = globalThis.fetch
    const { Settings, engine, player } = getSettings()
    let currentConfig = { ...config }
    const patches = []
    globalThis.fetch = async (url, options = {}) => {
      if (url.endsWith('/voices')) return json({ voices: [] })
      if (options.method === 'POST') {
        const { patch } = JSON.parse(options.body)
        patches.push(patch)
        currentConfig = { ...currentConfig, ...patch }
      }
      return json({ config: currentConfig })
    }
    let view
    try {
      await act(async () => { view = create(React.createElement(Settings, { t, engine, player })) })
      const toggle = () => view.root.findByProps({ 'aria-label': 'settings.pronunciationEnabled' })
      assert.equal(toggle().props.checked, true)
      const field = view.root.findByProps({ placeholder: 'settings.pronunciationLexicon.placeholder' })
      await act(async () => field.props.onChange({ target: { value: 'KV cache = K V 缓存' } }))
      await act(async () => { await button(view, 'settings.save').props.onClick() })
      assert.equal(patches[0].pronunciationEnabled, true)
      assert.equal(patches[0].pronunciationLexicon, 'KV cache = K V 缓存')
      assert.equal(patches[0].provider, 'local')
      assert.equal(patches[0].model, '/home/models/drama-3')
      await act(async () => toggle().props.onChange({ target: { checked: false } }))
      await act(async () => { await button(view, 'settings.save').props.onClick() })
      assert.equal(patches[1].pronunciationEnabled, false)
      assert.equal(patches[1].pronunciationLexicon, 'KV cache = K V 缓存', 'turning pronunciation off must keep the saved dictionary')
    } finally {
      if (view) await act(async () => view.unmount())
      globalThis.fetch = originalFetch
    }
  })

  it('separates readable term spellings from pronunciation controls and sends the prepared synthesis segments', async () => {
    const originalFetch = globalThis.fetch
    const { Settings, engine, player, translate } = getSettings()
    const synthesis = '[认真地解释]HH AH1 M IH0 NG 使用 K V 缓存。'
    const plan = {
      spokenText: 'Humming 使用 KV cache。', script: '[认真地解释]Humming 使用 KV cache。',
      synthesisText: synthesis, segments: [synthesis], cleanedText: 'Humming 使用 KV cache。',
      pronunciationChanges: [{ term: 'Humming', reading: '/ˈhʌmɪŋ/', kind: 'phoneme' }, { term: 'KV cache', reading: 'K V 缓存', kind: 'alias' }],
      omittedCode: 2, summaryRejection: { reason: 'changed-identifier', values: ['Humming'] },
      summarized: false, tagged: true, warnings: ['summary-rejected'],
    }
    const calls = []
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, body: options.body ? JSON.parse(options.body) : null })
      if (url.endsWith('/voices')) return json({ voices: [] })
      if (url.endsWith('/plan')) return json(plan)
      if (url.endsWith('/speech')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } })
      return json({ config })
    }
    let view
    try {
      await act(async () => { view = create(React.createElement(Settings, { t: translate, engine, player })) })
      const source = 'Humming 使用 KV cache。命令：python run.py --port 18190'
      const sampleField = view.root.findAllByType('textarea').find((node) => node.props.value.includes('我已经检查'))
      await act(async () => sampleField.props.onChange({ target: { value: source } }))
      await act(async () => { await button(view, '精简 + Auto Tag').props.onClick() })
      assert.ok(view.root.findAllByType('dt').some((node) => node.children.includes('Humming')))
      assert.ok(view.root.findAllByType('dd').some((node) => node.children.includes('英语发音 /ˈhʌmɪŋ/')))
      assert.ok(view.root.findAllByType('dd').some((node) => node.children.includes('K V 缓存')))
      const technical = view.root.findAllByType('details').find((node) => node.findAllByType('summary').some((child) => child.children.includes('发送给语音模型的文本')))
      assert.equal(technical.props.open, undefined, 'synthesis controls should be folded by default')
      assert.equal(technical.findByType('pre').children.join(''), synthesis)
      const original = view.root.findAllByType('details').find((node) => node.findAllByType('summary').some((child) => child.children.includes('原回复对照')))
      assert.ok(original.findAllByType('div').some((node) => node.children.includes(source)))
      const htmlText = JSON.stringify(view.toJSON())
      assert.match(htmlText, /改变了技术标识 \(Humming\)/)
      assert.match(htmlText, /2 处长代码或命令保留在原回复中/)
      assert.match(htmlText, /python run.py --port 18190/)
      await act(async () => { await button(view, '保存并试听').props.onClick() })
      assert.equal(calls.filter((call) => call.url.endsWith('/plan')).length, 1)
      assert.equal(calls.find((call) => call.url.endsWith('/speech')).body.text, synthesis)
      assert.equal(player.get().script, plan.script)
      assert.equal(player.get().synthesisText, synthesis)
      assert.equal(player.get().originalText, source)
      assert.deepEqual(player.get().pronunciationChanges, plan.pronunciationChanges)
      assert.deepEqual(player.get().summaryRejection, plan.summaryRejection)
      assert.equal(player.get().omittedCode, 2)
    } finally {
      if (view) await act(async () => view.unmount())
      globalThis.fetch = originalFetch
    }
  })

  it('can favor earlier playback without changing the voice, provider or speed', async () => {
    const originalFetch = globalThis.fetch
    const { Settings, engine, player, translate } = getSettings()
    let currentConfig = { ...config }
    const patches = []
    globalThis.fetch = async (url, options = {}) => {
      if (url.endsWith('/voices')) return json({ voices: [] })
      if (options.method === 'POST') {
        const { patch } = JSON.parse(options.body)
        patches.push(patch); currentConfig = { ...currentConfig, ...patch }
      }
      return json({ config: currentConfig })
    }
    let view
    try {
      await act(async () => { view = create(React.createElement(Settings, { t: translate, engine, player })) })
      const toggle = view.root.findByProps({ 'aria-label': '短回复整段连贯合成' })
      assert.equal(toggle.props.checked, true)
      assert.match(JSON.stringify(view.toJSON()), /首段等待可能稍长/)
      await act(async () => toggle.props.onChange({ target: { checked: false } }))
      await act(async () => { await button(view, '保存').props.onClick() })
      assert.equal(patches[0].wholeReplyEnabled, false)
      for (const key of ['provider', 'model', 'refAudioPath', 'refText', 'speed']) assert.equal(patches[0][key], config[key])
      assert.match(JSON.stringify(view.toJSON()), /用于长回复或关闭整段合成时/)
    } finally {
      if (view) await act(async () => view.unmount())
      globalThis.fetch = originalFetch
    }
  })

  it('previews the applied sentence plan in a collapsed section and keeps whole-reply metadata through playback', async () => {
    const originalFetch = globalThis.fetch
    const { Settings, engine, player, translate } = getSettings()
    const sentences = [
      { text: '先说明结果。', intent: 'explain', emphasis: '', pauseAfter: 'short', pace: 'normal', delivery: '' },
      { text: '不过需要保留缓存。', intent: 'contrast', emphasis: '保留缓存', pauseAfter: 'short', pace: 'slower', delivery: '认真地解释' },
      { text: '注意版本。', intent: 'caution', emphasis: '', pauseAfter: 'short', pace: 'normal', delivery: '' },
      { text: '接着核对日志。', intent: 'next-step', emphasis: '', pauseAfter: 'short', pace: 'normal', delivery: '' },
      { text: '这样就可以了。', intent: 'closing', emphasis: '', pauseAfter: 'none', pace: 'normal', delivery: '' },
    ]
    let plan = {
      script: '先说明结果。不过需要<emphasis>保留缓存</emphasis>。注意版本。接着核对日志。这样就可以了。',
      spokenText: sentences.map((sentence) => sentence.text).join(''),
      cleanedText: sentences.map((sentence) => sentence.text).join(''),
      segments: ['先说明结果。不过需要保留缓存。注意版本。接着核对日志。这样就可以了。'],
      synthesisMode: 'whole-reply', spokenUnits: 36, segmentationReason: null,
      prosody: sentences, prosodySource: 'model', prosodyStatus: 'applied',
      summarized: true, tagged: true, warnings: [],
    }
    globalThis.fetch = async (url) => {
      if (url.endsWith('/voices')) return json({ voices: [] })
      if (url.endsWith('/plan')) return json(plan)
      if (url.endsWith('/speech')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } })
      return json({ config })
    }
    let view
    try {
      await act(async () => { view = create(React.createElement(Settings, { t: translate, engine, player })) })
      await act(async () => { await button(view, '精简 + Auto Tag').props.onClick() })
      const detail = () => view.root.findAllByType('details').find((node) => node.findAllByType('summary').some((child) => child.children.includes('句间衔接与重点')))
      assert.equal(detail().props.open, undefined)
      const previewText = JSON.stringify(view.toJSON())
      assert.match(previewText, /整段连贯合成/)
      for (const label of ['解释', '转折', '提醒', '下一步', '收尾', '强调：保留缓存', '句后短停顿', '放缓', '语气：认真地解释']) assert.ok(previewText.includes(label))
      assert.equal(detail().findAllByType('li').length, 5)
      await act(async () => { await button(view, '保存并试听').props.onClick() })
      assert.equal(player.get().synthesisMode, 'whole-reply')
      assert.equal(player.get().total, 1)
      assert.deepEqual(player.get().prosody, sentences)
      assert.equal(player.get().prosodyStatus, 'applied')
      plan = { ...plan, prosodySource: 'rules', prosodyStatus: 'fallback', prosodyError: 'private-parse-diagnostic' }
      await act(async () => { await button(view, '精简 + Auto Tag').props.onClick() })
      assert.match(JSON.stringify(view.toJSON()), /韵律计划未匹配原文，已使用自然断句/)
      assert.equal(view.root.findAllByProps({ className: 'drama3-tts-warning' }).length, 0, 'rule fallback is an explanatory note, not a warning banner')
      assert.doesNotMatch(JSON.stringify(view.toJSON()), /private-parse-diagnostic/)
    } finally {
      if (view) await act(async () => view.unmount())
      globalThis.fetch = originalFetch
    }
  })

  it('sends only earlier visible conversation text as bounded context', async () => {
    const { ctx, registrations } = createContext()
    plugin.apply(ctx)
    const Actions = registrations.find((entry) => entry.options.name === 'conversation.chat.assistant-actions').component
    const spoken = []
    const player = {
      subscribe: () => () => {}, pendingFor: () => false, playingFor: () => false,
      speak: async (...args) => spoken.push(args), stop: () => {},
    }
    const nodes = [
      { kind: 'user', seq: 1, content: [{ type: 'text', text: '请简短回答。' }, { type: 'image', data: 'private-binary' }] },
      { kind: 'assistant', seq: 2, messageId: 'earlier', blocks: [{ kind: 'reasoning', text: 'hidden reasoning' }, { kind: 'text', text: '明白。' }], time: 1 },
      { kind: 'assistant', seq: 3, messageId: 'target', blocks: [{ kind: 'text', text: '这是当前回答。' }], time: 2 },
      { kind: 'user', seq: 4, content: [{ type: 'text', text: '未来消息，不应该发送。' }] },
    ]
    let view
    try {
      await act(async () => {
        view = create(React.createElement(Actions, { t, messageId: 'target', sessionId: 'session-context', player, autoRead: () => false,
          loadTime: 10, played: new Set(), unlock: () => {}, useChat: (selector) => selector({ legacy: { nodes } }) }))
      })
      await act(async () => { view.root.findByType('button').props.onClick() })
      assert.equal(spoken.length, 1)
      assert.equal(spoken[0][4], 'session-context')
      assert.deepEqual(spoken[0][2], [{ role: 'user', content: '请简短回答。' }, { role: 'assistant', content: '明白。' }])
    } finally { if (view) await act(async () => view.unmount()) }
  })
})

describe('automatic read attempts', () => {
  const { create, act } = webRequire('react-test-renderer')
  const setup = (speak) => {
    const { ctx, registrations } = createContext()
    plugin.apply(ctx)
    const entry = registrations.find((item) => item.options.name === 'conversation.chat.assistant-actions')
    const injected = entry.options.inject()
    const calls = []
    const player = {
      subscribe: () => () => {}, pendingFor: () => false, playingFor: () => false, stop: () => {},
      speak: async (...args) => { calls.push(args); return speak?.(...args) },
    }
    const state = {
      sessionId: 'session-a', time: 2000, context: '请解释计算过程。', autoRead: () => true,
    }
    const played = injected.played
    const watermarks = new Map([
      ['session-a', { seq: 0, time: 1000 }],
      ['session-b', { seq: 0, time: 1000 }],
    ])
    const useChat = (selector) => selector({ legacy: { nodes: [
      { kind: 'user', seq: 1, content: [{ type: 'text', text: state.context }] },
      { kind: 'assistant', messageId: 'reply', seq: 2, turn: 1, step: 1, time: state.time,
        blocks: [{ kind: 'text', text: '接着看计算过程。这是第二句话。' }] },
    ] } })
    const render = (key = 'action') => React.createElement(entry.component, {
      key, t, messageId: 'reply', sessionId: state.sessionId, player, useChat,
      autoRead: state.autoRead, loadTime: 1000, played, watermarks, unlock: () => {},
    })
    return { calls, state, render }
  }

  for (const change of ['earlier context', 'autoRead function identity', 'same-message timestamp', 'component remount']) {
    it(`does not restart a failed automatic read after ${change} changes`, async () => {
      const harness = setup(() => { throw Object.assign(new Error('failed'), { code: 'upstream-failed' }) })
      let view
      try {
        await act(async () => { view = create(harness.render()) })
        assert.equal(harness.calls.length, 1)
        if (change === 'earlier context') harness.state.context = '更具体一点，说明数据搬运。'
        if (change === 'autoRead function identity') harness.state.autoRead = () => true
        if (change === 'same-message timestamp') harness.state.time++
        if (change === 'component remount') {
          await act(async () => view.unmount())
          await act(async () => { view = create(harness.render('remounted')) })
        } else {
          await act(async () => view.update(harness.render()))
        }
        assert.equal(harness.calls.length, 1, 'a failed automatic attempt must wait for an explicit retry')
      } finally { if (view) await act(async () => view.unmount()) }
    })
  }

  it('claims one automatic attempt across two action surfaces, including after failure', async () => {
    const harness = setup(() => { throw Object.assign(new Error('failed'), { code: 'playback-failed' }) })
    const renderBoth = () => React.createElement(React.Fragment, null, harness.render('first'), harness.render('second'))
    let view
    try {
      await act(async () => { view = create(renderBoth()) })
      assert.equal(harness.calls.length, 1, 'duplicate surfaces must share the initial attempt')
      harness.state.autoRead = () => true
      await act(async () => view.update(renderBoth()))
      assert.equal(harness.calls.length, 1, 'a rejected attempt must not reopen the claim to either surface')
    } finally { if (view) await act(async () => view.unmount()) }
  })

  it('does not automatically interrupt a manual read and still permits explicit retries', async () => {
    const requests = []
    const harness = setup(() => new Promise((resolve, reject) => requests.push({ resolve, reject })))
    harness.state.autoRead = () => false
    let view
    try {
      await act(async () => { view = create(harness.render()) })
      await act(async () => view.root.findByType('button').props.onClick())
      assert.equal(harness.calls.length, 1, 'the click starts the manual read')
      harness.state.autoRead = () => true
      harness.state.context = '继续解释，同时保持当前朗读。'
      harness.state.time++
      await act(async () => view.update(harness.render()))
      assert.equal(harness.calls.length, 1, 'enabling auto-read or changing dependencies must not replace a manual read')
      await act(async () => requests[0].reject(Object.assign(new Error('failed'), { code: 'playback-failed' })))
      await act(async () => view.root.findByType('button').props.onClick())
      assert.equal(harness.calls.length, 2, 'the user can explicitly retry even after the automatic claim is consumed')
      await act(async () => requests[1].resolve())
      harness.state.autoRead = () => true
      await act(async () => view.update(harness.render()))
      assert.equal(harness.calls.length, 2, 'completion must not schedule another automatic read')
    } finally {
      for (const request of requests) request.resolve()
      if (view) await act(async () => view.unmount())
    }
  })

  it('keeps automatic attempts independent for identical message IDs in different sessions', async () => {
    const harness = setup()
    let view
    try {
      await act(async () => { view = create(harness.render()) })
      harness.state.sessionId = 'session-b'
      await act(async () => view.update(harness.render()))
      assert.deepEqual(harness.calls.map((args) => [args[0], args[4]]), [
        ['reply', 'session-a'], ['reply', 'session-b'],
      ], 'message IDs from separate conversations must not suppress each other')
      harness.state.sessionId = 'session-a'
      await act(async () => view.update(harness.render()))
      await act(async () => view.unmount())
      harness.state.sessionId = 'session-b'
      await act(async () => { view = create(harness.render('remounted')) })
      assert.equal(harness.calls.length, 2, 'each conversation retains its own consumed automatic attempt')
    } finally { if (view) await act(async () => view.unmount()) }
  })
})

it('auto-reads new finalized replies while keeping initial and switched history silent', async () => {
  const { create, act } = webRequire('react-test-renderer')
  const { ctx, registrations } = createContext()
  plugin.apply(ctx)
  const actionEntry = registrations.find((entry) => entry.options.name === 'conversation.chat.assistant-actions')
  const composerEntry = registrations.find((entry) => entry.options.name === 'conversation.input.left')
  const watermarks = actionEntry.options.inject().watermarks
  const spoken = []
  const stableIdle = { status: 'idle' }
  const player = {
    subscribe: () => () => {}, get: () => stableIdle,
    pendingFor: () => false, playingFor: () => false,
    speak: async (...args) => spoken.push(args), stop: () => {},
  }
  const node = (id, seq, time) => ({ kind: 'assistant', messageId: id, seq, time, turn: 1, step: seq, blocks: [{ kind: 'text', text: `${id} reply` }] })
  const played = new Set()
  let nodes = []
  const useChat = (selector) => selector({ legacy: { nodes } })
  const render = (sessionId) => React.createElement(React.Fragment, null,
    React.createElement(composerEntry.component, { t, read: () => true, set: () => {}, subscribe: () => () => {},
      player, unlock: () => {}, sessionId, useChat, watermarks }),
    ...nodes.map((entry) => React.createElement(actionEntry.component, { key: entry.messageId, t, messageId: entry.messageId,
      sessionId, useChat, watermarks, player, autoRead: () => true, loadTime: 0, played, unlock: () => {} })))
  let view
  try {
    await act(async () => { view = create(render('empty-session')) })
    nodes = [node('new', 1, Date.now() + 1000)]
    await act(async () => view.update(render('empty-session')))
    assert.deepEqual(spoken.map((entry) => entry[0]), ['new'], 'empty sessions must read their first new reply')
    nodes = [node('background-history', 12, Date.now() - 5)]
    await act(async () => view.update(render('other-session')))
    assert.deepEqual(spoken.map((entry) => entry[0]), ['new'], 'entering a different conversation must not read its history')
    await act(async () => view.root.findByProps({ 'data-drama3-tts': 'background-history' }).props.onClick())
    assert.deepEqual(spoken.map((entry) => entry[0]), ['new', 'background-history'], 'manual playback remains available')
    assert.deepEqual(spoken.map((entry) => entry[4]), ['empty-session', 'other-session'], 'both automatic and manual reads keep their owning session')
  } finally { if (view) await act(async () => view.unmount()) }
})

it('keeps processing notes inside the expandable read-aloud details', async () => {
  const { create, act } = webRequire('react-test-renderer')
  const { ctx, registrations, dictionaries } = createContext()
  plugin.apply(ctx)
  const PlaybackBar = registrations.find((entry) => entry.options.name === 'conversation.input.dock').component
  const translate = (key) => dictionaries().zh[key] ?? key
  for (const [reason, values, expected] of [
    ['invalid-structure', [], /精简结果格式不正确/],
    ['expanded', [], /精简稿比原文更长/],
    ['new-numeric-value', [128], /原文没有的数字 \(128\)/],
    ['changed-identifier', ['CUDA_12'], /改变了技术标识 \(CUDA_12\)/],
  ]) {
    const state = {
      status: 'speaking', script: '整理后的原文。', warnings: ['summary-rejected'],
      summaryRejection: { reason, values }, omittedCode: 3, clips: [], bars: [],
    }
    const player = { subscribe: () => () => {}, get: () => state, retry: async () => {}, stop: () => {} }
    let view
    try {
      await act(async () => { view = create(React.createElement(PlaybackBar, { player, t: translate })) })
      assert.doesNotMatch(JSON.stringify(view.toJSON()), expected)
      const show = view.root.findAllByType('button').find((node) => node.children.includes('查看朗读内容'))
      assert.equal(show.props['aria-expanded'], false)
      await act(async () => show.props.onClick())
      const expanded = JSON.stringify(view.toJSON())
      assert.match(expanded, expected)
      assert.match(expanded, /3 处长代码或命令保留在原回复中，不逐字朗读/)
      assert.doesNotMatch(expanded, /summary-rejected/)
      const hide = view.root.findAllByType('button').find((node) => node.children.includes('收起朗读内容'))
      assert.equal(hide.props['aria-expanded'], true)
      await act(async () => hide.props.onClick())
      assert.doesNotMatch(JSON.stringify(view.toJSON()), expected)
    } finally { if (view) await act(async () => view.unmount()) }
  }
})

it('keeps synthesis details out of the player while retaining useful segment progress', () => {
  const portalFreePlugin = module_.factory((id) => id === 'react' ? React : { createPortal: (children) => children })
  const { ctx, registrations, dictionaries } = createContext()
  portalFreePlugin.apply(ctx)
  const PlaybackBar = registrations.find((entry) => entry.options.name === 'conversation.input.dock').component
  const translate = (key) => dictionaries().zh[key] ?? key
  for (const [synthesisMode, segmentationReason, total] of [
    ['whole-reply', null, 1],
    ['segmented', 'disabled', 2],
    ['segmented', 'long-reply', 2],
    ['segmented', 'payload-limit', 2],
  ]) {
    const state = { status: 'speaking', script: '这里是原拼写朗读稿。', clips: [], bars: [], warnings: [],
      synthesisMode, segmentationReason, total, segment: total }
    const player = { subscribe: () => () => {}, get: () => state, retry: async () => {}, stop: () => {} }
    const html = renderToStaticMarkup(React.createElement(PlaybackBar, { player, t: translate }))
    assert.doesNotMatch(html, /整段|分段|已关闭整段合成|回复较长|超出单次长度/)
    assert.match(html, /查看朗读内容/)
    if (total === 1) assert.doesNotMatch(html, /第 1 \/ 1 段/)
    else assert.match(html, /第 2 \/ 2 段/)
  }
})
