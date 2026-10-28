# Configuration

**English** | [简体中文](configuration.zh-CN.md)

[Back to README](../README.md) · [Development and API](development.md)

## Service roles

| Service | Purpose | When required |
| --- | --- | --- |
| Drama 3 or Fish Audio | Synthesizes the spoken script; local mode uses a reference recording and its transcript | When generating new audio |
| Text processing model | Condenses the spoken script and plans sentence-level tone | When condensation or tone planning is enabled |
| Speech recognition model | Transcribes the generated audio so the plugin can check Chinese sentence openings | Only in local mode, with opening checks enabled, for eligible segments |

Speech recognition is optional. Before enabling opening checks, confirm the recognition endpoint and a model ID supported by that service in settings. A recognition service is not required when checks are off.

Local synthesis calls `${baseUrl}/v1/audio/speech`. Text processing and recognition each append `/chat/completions` to their configured endpoint. The synthesis endpoint therefore usually omits `/v1`, while text and recognition endpoints usually include `/v1`. These are common deployment conventions; use the actual routes exposed by your services.

## Storage and saving

Settings are stored in `$DSH_HOME/drama3-tts/config.json`; when `DSH_HOME` is unset, the plugin uses `~/.dsh`. Uploaded reference recordings are stored in the adjacent `voices/` directory, and generated audio is cached in `cache/`. When reading stored settings, missing fields and fields with incorrect types fall back to code defaults. Saving settings validates and merges each supplied field: omitted fields retain their values, while some invalid fields are ignored or cause an error. Invalid fields are not all reset to defaults.

The **Default** values in the tables below are initial code defaults. Saved settings take precedence.

### Voice and connection

| Field | Default | Description |
| --- | --- | --- |
| `provider` | `local` | `local` or `fish` |
| `baseUrl` | `http://127.0.0.1:18190` | Synthesis service root URL; HTTP/HTTPS |
| `model` | `/home/models/drama-3` | Model ID accepted by the synthesis service |
| `refAudioPath` | Empty | Recording path readable by the host; required in local mode |
| `refText` | Empty | Exact transcript of the reference recording; required in local mode |
| `speed` | `1` | `0.75`–`1.6`, rounded to two decimal places when saved |
| `format` | `mp3` | `mp3` or `wav` |
| `apiKey` | Empty | Synthesis service key; required for Fish Audio |
| `voiceId` | `fbe02f8306fc4d3d915e9871722a39d5` | Fish Jialan 3.0 preset ID; not used for local synthesis |

Switching to Fish Audio in settings selects `https://api.fish.audio` and the `drama-3` model. If you switch providers through the configuration API, also set the appropriate endpoint, model, and voice.

Reference uploads support WAV, MP3, M4A, FLAC, and OGG, up to 20 MiB per file. Recording duration and encoding must also meet the upstream service's requirements. The reference recording guides voice characteristics, and its transcript provides alignment; the transcript must match what the recording actually says.

The plugin sends the speed setting to the synthesis service. Browser playback stays at `1` to avoid applying the speed adjustment twice. Do not alter the reference transcript to control speaking speed.

### Spoken content

| Field | Default | Description |
| --- | --- | --- |
| `summaryEnabled` | `true` | Condense replies |
| `summaryMaxChars` | `220` | Target length, from `80`–`800`; a soft target, not a truncation limit |
| `tagEnabled` | `true` | Plan sentence-level tone; disabling this stops automatic performance tags |
| `tagMax` | `3` | Tone control budget for the full reply, from `1`–`6` |
| `tagMode` | `strip` | Strip existing tags while cleaning input; `keep` preserves accepted existing tags |
| `tagBaseUrl` | `http://127.0.0.1:18188/v1` | Text processing endpoint |
| `tagModel` | `dsv41-flash` | Text processing model ID; can be changed |
| `tagApiKey` | Empty | Text processing service key |
| `pronunciationEnabled` | `true` | Apply built-in pronunciations and the custom lexicon |
| `pronunciationLexicon` | Empty | One `term = reading` entry per line |
| `wholeReplyEnabled` | `true` | Synthesize short replies in one pass when possible |
| `maxChars` | `180` | Target segment length, from `60`–`600`; punctuation and payload limits also affect boundaries |

The text processing key falls back in this order: `tagApiKey`, `MOLOU_DEV_API_KEY`, then `OPENAI_API_KEY`. The configuration GET response returns only `hasApiKey` and `hasTagApiKey` flags, not the keys themselves. Selecting a remote service sends the relevant reply, context, or audio to its configured endpoint.

The prompt asks the model to preserve key conclusions, evidence, and qualifications when condensing a reply. Validation checks structure, whether the summary is longer, whether it introduces new numbers, and whether it changes technical identifiers containing digits. It cannot prove that negation, conditions, or the full meaning have been preserved. `6.5×` and `6.5 倍` are treated as equivalent multiplier suffixes; `6.5×2` is still treated as multiplication. A first content validation failure requests one correction; a second failure falls back to the cleaned original reply. Parsing failures or service errors fall back immediately.

The sentence plan must align with the script sentence by sentence without rewriting it. Invalid plans fall back to rule-based sentence boundaries. The compiler applies a consistent delivery direction and adds emphasis, brief pauses, or closing directions within the budget. Pause tags do not guarantee a fixed duration in milliseconds. Supported paired tags include `emphasis`, `whisper`, `soft`, `fast`, `slow`, `stress`, and `forceful`.

Example lexicon entry for a Chinese reading:

```text
KV cache = K V 缓存
```

Custom entries take priority over built-in rules. The lexicon accepts up to 100 entries with plain-text readings only; do not include control tags or phoneme markup. Built-in rules use phoneme controls for some English words and spell out abbreviations letter by letter. Unmatched terms do not receive guessed pronunciations. English entries reference the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict). Listen to verify brand names and abbreviations.

Whole-reply synthesis applies when both the readable script length and `spokenUnits` are at most 320, and the actual synthesis text is at most 1200 characters. Phoneme markup can cause the payload to reach its limit sooner. Longer content is split at natural boundaries. Each segment is synthesized independently, so identical timbre and breathiness are not guaranteed across segments. The generation budget is `1024`–`2048` output tokens based on script and phoneme length; it does not guarantee an audio duration.

### Optional opening checks

| Field | How to configure |
| --- | --- |
| `speechCheckEnabled` | Defaults to `false`; enable as needed to check Chinese sentence openings in local mode |
| `speechCheckBaseUrl` | Enter the recognition API base URL; requests append `/chat/completions` |
| `speechCheckModel` | Enter a model ID supported by the configured recognition service |

When checks are enabled, eligible segments follow this sequence:

1. Drama 3 generates the audio.
2. The recognition service transcribes the actual audio. The request does not include the expected words, so the recognizer is not prompted to fill them in.
3. The plugin compares the Chinese opening. If it appears to be missing, the plugin resynthesizes once with a new sampling seed.
4. There are at most two synthesis attempts. If the opening still does not match, the plugin returns an error and neither plays nor caches that candidate. An unavailable recognition service also blocks playback of segments awaiting checks.

An opening anchor is created only for a Chinese-only first sentence containing at least 6 Chinese characters. Openings containing English, digits, or phoneme controls, and short greetings, are skipped. If the first sentence exceeds 40 Chinese characters, only its first 24 characters are checked, with some tolerance for recognition errors. The recognition endpoint must support `audio_url` data URL input, `modalities: ["text"]`, and a plain-text response in `choices[0].message.content`. These requests do not include the synthesis or text processing service keys.

This check does not validate the full text, English pronunciation, or repeated syllables later in the audio. Recognition can also omit words or repeat text, so its output is only one source of diagnostic evidence. With checks disabled, normal read-aloud does not depend on the recognition service.
