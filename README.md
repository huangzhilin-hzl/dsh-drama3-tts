# dsh-drama3-tts

**English** | [简体中文](README.zh-CN.md)

Turn DSH assistant replies into scripts for listening, then generate speech with Drama 3 and a reference recording. The original chat reply stays intact, and the spoken script is available separately.

Pipeline: **Clean and condense → Optional tone and prosody planning → Technical pronunciation → Whole-reply or segmented synthesis → Playback**. Speech recognition is used only for an optional check of Chinese sentence openings. It is off by default and is not required for normal playback.

## Demo

<video controls src="https://github.com/user-attachments/assets/30d441fd-c965-4dbd-95d0-194666b04e99"></video>

The recording starts in a DSH conversation: click **Read aloud** beside an assistant reply, then expand **View spoken text** and **Tone and pronunciation details** to inspect the condensed script and automatically generated tags while it plays. The player collapses when playback finishes. It uses local Drama 3 with the Jialan 3.5 reference voice at 1.2× speed; the recorded interface and speech are Chinese.

The video includes the actual audio played by the plugin, at its recorded speed.

Speech sample on its own, with the plugin screenshot as the cover frame:

<video controls src="https://github.com/user-attachments/assets/b00bdce7-80d3-4267-aa05-43971abf1bb3"></video>

GitHub only plays media inline when it is uploaded as an attachment, so both players stream from this repository's [demo media issue](https://github.com/huangzhilin-hzl/dsh-drama3-tts/issues/1). Repository copies for offline use: [demo.mp4](examples/demo/demo.mp4) · [audio.mp3](examples/demo/audio.mp3).

## Getting started

Requires Node.js 22 or later and DSH `>=0.2.1-rc.2 <0.3.0`.

1. Add the local project directory on DSH's Plugins page: `link:/absolute/path/dsh-drama3-tts`. Enable the plugin and refresh the page.
2. Open **Settings → Read aloud**, select the local provider, and enter its endpoint and a model ID returned by `/v1/models`.
3. Choose or upload a reference recording and enter its exact transcript. You can use the [example reference audio](#example-reference-audio) below. Do not include control tags in the reference transcript; they are not spoken words.
4. Configure a text processing service when **Condense replies** is enabled. **Tone and sentence prosody** can be turned off independently. **Technical pronunciation** and **Synthesize short replies together** are on by default.
5. In the preview area, generate a spoken script, review its content and pronunciations, then click **Save and preview**. The script preparation button's label depends on the condensation and tone settings.
6. Click **Read aloud** beside a reply, or enable **Auto-read** beside the message input.

Local mode requires a Drama 3 service that supports `ref_audio` and `ref_text`; a service offering only the standard OpenAI TTS interface may not be compatible. Fish Audio cloud is an optional provider and requires its own API key and voice ID.

## Example reference audio

For local Drama 3, the tutorial includes a **Jialan 3.5 (嘉岚 3.5)** reference recording: a 20-second mono WAV file. Using this sample is optional; you can supply your own recording instead.

- [Reference audio — jialan-3.5-20s.wav](examples/reference-audio/jialan-3.5-20s.wav)
- [Matching transcript — jialan-3.5-20s.txt](examples/reference-audio/jialan-3.5-20s.txt)

Download the WAV or use the copy in your local checkout. In **Settings → Read aloud**, select the local provider, click **Upload audio**, and choose the file. Paste the following Chinese text into **Reference transcript** exactly as written, without translating it or adding tone tags, then click **Save and preview**:

```text
到这儿我得说实话：再往下说，我就要开始复读自己了。第五个“继续”之后，剩下的选择基本是讲个冷笑话、装作有灵感，或者干脆承认没词了。我选后者。但也不是完全没得聊。
```

## Behavior

- Short replies are synthesized in one pass when possible. Longer replies are split at natural punctuation, with the next segment prefetched during playback.
- The player sits above the current conversation's message input. It supports pause, resume, seeking, and stop, and collapses automatically when playback finishes.
- Expand **View spoken text** to inspect the script, processing notices, original reply, and actual synthesis text, and to download generated audio.
- Each reply gets only one automatic playback attempt per conversation within the current page. A failure, stop, or component remount does not automatically restart it. Manual retries remain available.
- If a condensed script fails validation, the plugin requests one correction at most. If that also fails, it reads the cleaned original reply. Correction does not relax checks on numbers or technical identifiers.

## Documentation

All guides are available in English and Simplified Chinese. Use the language links at the top of each page to switch.

| Document | Contents |
| --- | --- |
| [Configuration](docs/configuration.md) | Service roles, code defaults, reference recordings, terminology, and optional speech recognition checks |
| [Development and API](docs/development.md) | Module boundaries, processing flow, HTTP endpoints, tests, and packaging |

## Development checks

```sh
npm ci
npm run check
npm test
```

By default, tests use temporary configuration directories and mocked upstream services. They do not modify personal settings or require running models. Live synthesis tests must be explicitly enabled; see [Development and API](docs/development.md#validation).

References: [Drama 3 tags](https://docs.fish.audio/features/text-to-speech/drama-3), [Reference recording guidelines](https://docs.fish.audio/developer-guide/best-practices/voice-cloning), [Fish Jialan 3.0 preset](https://fish.audio/zh-CN/m/fbe02f8306fc4d3d915e9871722a39d5/).
