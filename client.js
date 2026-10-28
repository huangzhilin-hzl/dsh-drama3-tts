/**
 * dsh-drama3-tts — browser half.
 *
 * Reads finalized assistant replies aloud through the Host half:
 *   `conversation.chat.assistant-actions` gains a per-message speaker,
 *   `conversation.input.left` gains an auto-read switch,
 *   `conversation.input.dock` hosts the in-flow playback controls,
 *   `settings.section` gains the provider / reference-voice page.
 *
 * The file is already in the Web client's lazy-module format: executing it only
 * registers a factory; the body runs when the module table materializes the plugin.
 */
window.__ModuleLoader__.load({
  id: 'dsh-drama3-tts',
  factory(require) {
    const React = require('react')

    const NS = 'drama3-tts'
    const PREFIX = '/drama3-tts'
    const AUTO_KEY = 'dsh-drama3-tts.autoRead'
    const SAMPLE_ZH = '我已经检查了插件的处理流程。现在可以先把较长的回复整理成简短、自然的口语，再根据上下文添加适当的语气。参考录音会决定声音的特点，建议先用同一句话试听，确认音色和节奏是否合适。'
    const SAMPLE_EN = 'Hello, this is a Drama 3 read-aloud test using your configured reference clip.'
    const FISH_JIALAN_PRESET = Object.freeze({
      provider: 'fish',
      baseUrl: 'https://api.fish.audio',
      model: 'drama-3',
      voiceId: 'fbe02f8306fc4d3d915e9871722a39d5',
      speed: 1,
    })

    // Older hosts may omit newly added fields. Returned configuration always
    // wins; filling a missing field must not enable the optional ASR dependency.
    const SETTINGS_COMPATIBILITY_DEFAULTS = Object.freeze({
      wholeReplyEnabled: true,
      pronunciationEnabled: true,
      pronunciationLexicon: '',
      speechCheckEnabled: false,
      speechCheckBaseUrl: 'http://127.0.0.1:18189/v1',
      speechCheckModel: 'qwen2.5-omni-3b',
    })

    const zh = {
      'action.speak': '朗读',
      'action.stop': '停止朗读',
      'action.speak.aria': '朗读这条回复',
      'action.busy': '正在合成…',
      'error.failed': '朗读失败',
      'error.textRequired': '这条回复没有可朗读的文字',
      'error.upstream': '语音服务不可用',
      'error.apiKeyRequired': '先在设置里填写 API Key',
      'error.referenceRequired': '先在设置里选择参考音频',
      'input.autoRead': '自动朗读',
      'input.autoRead.on': '自动朗读：开',
      'input.autoRead.off': '自动朗读：关',
      'input.playing': '正在朗读…点此停止',
      'input.stop': '停止朗读',
      'player.label': '朗读播放器',
      'player.pause': '暂停',
      'player.play': '继续播放',
      'player.seek': '点击定位',
      'player.download': '下载这段音频',
      'player.close': '停止朗读',
      'player.tags': '语气',
      'player.tags.title': '本次朗读使用的表演标签（悬停查看完整脚本）',
      'settings.label': '语音朗读',
      'settings.title': '语音朗读（Drama 3）',
      'settings.subtitle': '把回复交给本地 vLLM-Omni 的 Drama 3，或 Fish Audio 云端；音色由参考音频决定。',
      'settings.provider': '模型服务商',
      'settings.provider.local': '本地 vLLM-Omni（OpenAI 兼容）',
      'settings.provider.fish': 'Fish Audio 云端',
      'settings.baseUrl': '服务地址',
      'settings.baseUrl.hint.local': '例如 http://127.0.0.1:18190',
      'settings.baseUrl.hint.fish': '默认 https://api.fish.audio',
      'settings.model': '模型',
      'settings.model.hint.local': '服务端 /v1/models 里的 id，例如 /home/models/drama-3',
      'settings.model.hint.fish': '例如 s2.1-pro-free、s2.1-pro、drama-3',
      'settings.apiKey': 'API Key',
      'settings.apiKey.placeholder': '本地服务留空；云端必填',
      'settings.apiKey.saved': '已保存，留空表示不修改',
      'settings.apiKey.clear': '清除',
      'settings.refAudio': '参考音频',
      'settings.refAudio.none': '未选择',
      'settings.refAudio.placeholder': '本机路径，例如 /home/local/molou/ref/ref_zh.wav',
      'settings.refAudio.upload': '上传音频',
      'settings.refAudio.uploading': '上传中…',
      'settings.refText': '参考文本',
      'settings.refText.placeholder': '参考音频里说的那句话，必须逐字一致',
      'settings.voiceId': '音色 ID',
      'settings.voiceId.hint': '使用指定的 Fish 音色，嘉岚3.0 可直接用上方预设',
      'settings.tagMode': '方括号标签',
      'settings.tagMode.strip': '丢弃（朗读回复时推荐）',
      'settings.tagMode.keep': '保留为表演指令',
      'settings.tagMode.hint': 'Drama 3 会把 [叹气] 这类方括号当导演指令，回复正文里出现时通常该丢掉。',
      'settings.maxChars': '分段目标字数',
      'settings.maxChars.hint': '用于长回复或关闭整段合成时；按自然标点切段，边合成边播放',
      'settings.format': '音频格式',
      'settings.status': '连接状态',
      'settings.status.check': '检测',
      'settings.status.checking': '检测中…',
      'settings.status.ok': '可用',
      'settings.status.down': '不可用',
      'settings.status.models': '模型',
      'settings.save': '保存',
      'settings.saving': '保存中…',
      'settings.saved': '已保存',
      'settings.beep': '输出测试（蜂鸣）',
      'settings.download': '下载这段音频',
      'settings.output': '输出',
      'settings.test': '试听',
      'settings.testing': '合成中…',
      'settings.playing': '播放中…',
      'settings.played': '播放完毕',
      'settings.stop': '停止',
      'settings.speed': '语速',
      'settings.speed.hint': '建议先用 1.0 对比参考音色，再按听感调整节奏',
      'settings.tagEnabled': '语气与句级韵律',
      'settings.tagEnabled.on': '自动生成（推荐）',
      'settings.tagEnabled.off': '不加标签',
      'settings.tagEnabled.hint': '根据上下文安排解释、转折和收尾，适度强调与停顿；实际采用的句级计划可在预览中展开查看',
      'settings.tagMax': '每条最多几个标签',
      'settings.invalidUrl': '服务地址必须是 http(s) URL',
      'settings.uploadFailed': '上传失败',
      "player.script": "朗读稿",
      "player.viewScript": "查看朗读内容",
      "player.hideScript": "收起朗读内容",
      "player.voiceDetails": "语气与发音详情",
      "player.errorTitle": "暂时无法朗读",
      "player.preparing": "整理朗读稿…",
      "player.buffering": "生成语音…",
      "player.finished": "已播放完毕",
      "player.retry": "重新播放",
      "player.errorRetry": "重试",
      "player.downloadAll": "下载音频",
      "player.summary": "已精简",
      "player.original": "保留原文",
      "player.warnings": "本次处理提示",
      "player.part": "第 {n} 段",
      "player.segmentProgress": "第 {n} / {total} 段",
      "settings.flow": "精简要点 → 调整语气 → 参考音色合成",
      "settings.preset": "使用嘉岚3.0 · Fish Audio",
      "settings.preset.hint": "使用官网同一个音色 ID 和 Drama 3 模型。需要 Fish Audio API Key；生成会使用你的账户额度。",
      "settings.preset.applied": "嘉岚3.0 预设已填入，保存后生效",
      "settings.local.hint": "选择想使用的音色参考录音，并填写对应的逐字稿。参考录音、模型版本和采样方式都会影响相似度。",
      "settings.voice": "音色与连接",
      "settings.script": "朗读内容",
      "settings.summaryEnabled": "精简回复",
      "settings.summaryEnabled.hint": "保留结论、重要数字和下一步，去掉重复与书面铺垫；聊天中的原回复保持完整。",
      "settings.summaryMaxChars": "目标字数",
      "settings.summaryMaxChars.hint": "目标长度，不是截断上限；必要信息可能使朗读稿更长。",
      "settings.on": "开启",
      "settings.off": "关闭",
      "settings.advanced": "高级设置",
      "settings.tagBaseUrl": "文本处理服务地址",
      "settings.tagApiKey": "文本处理 API Key",
      "settings.speechCheckEnabled": "检查中文句首漏读",
      "settings.speechCheckEnabled.hint": "核对每段可检查的中文首句，漏读时最多重生成一次。会增加等待，不核验全文或英文发音。",
      "settings.speechCheckBaseUrl": "语音识别服务地址",
      "settings.speechCheckBaseUrl.hint": "用于核对句首，生成的音频会发送到此地址。",
      "settings.speechCheckModel": "语音识别模型",
      "settings.previewText": "试听文本",
      "settings.previewContext": "试听上下文（可选）",
      "settings.previewContext.hint": "例如：用户在询问排障进展，希望回答简短、沉稳。",
      "settings.previewContext.placeholder": "补充这句话在什么场景下说",
      "settings.preview.hint": "试听会先保存当前设置，再展示实际朗读稿；使用所选服务的账户额度。",
      "settings.preview.hint.local": "先预览精简和语气标签，再用本地模型试听；试听会保存当前设置。",
      "settings.previewAction": "保存并试听",
      "settings.dirty": "有未保存的修改",
      "settings.checkAction": "保存并检测",
      "settings.retryLoad": "重新加载",
      "settings.loadFailed": "无法读取插件设置，请确认 dsh 服务已运行。",
      "settings.uploaded": "参考录音已上传，请补全逐字稿并保存",
      "settings.uploadFormats": "支持 WAV、MP3、M4A、FLAC、OGG，最大 20 MB",
      "settings.readiness": "开始试听前还需要：",
      "settings.referenceTextRequired": "参考录音的逐字稿",
      "settings.voiceRequired": "音色 ID",
      "settings.unsaved": "修改尚未保存",
      "settings.tagModel": "文本处理模型",
      "settings.tagModel.hint": "用于精简与语气编排，可填写 OpenAI 兼容的模型 ID。",
      "settings.refAudio.saved": "已上传的录音",
      "settings.clearKey": "保存清除密钥",
      "settings.resetSpeed": "原始语速",
      "error.audio-locked": "浏览器还未允许播放，请点击重试",
      "error.empty-audio": "语音服务返回了空音频，请重试",
      "error.reference-required": "请选择参考音频",
      "error.reference-text-required": "请填写与参考录音一致的逐字稿",
      "error.ref-text-required": "请填写与参考录音一致的逐字稿",
      "error.api-key-required": "请填写 Fish Audio API Key",
      "error.voice-id-required": "请填写音色 ID",
      "error.reference-not-found": "找不到参考音频，请重新上传或检查路径",
      "error.invalid-base-url": "请填写有效的 http(s) 语音服务地址",
      "error.invalid-tag-base-url": "请填写有效的 http(s) 文本处理服务地址",
      "error.invalid-speech-check-base-url": "请填写有效的 http(s) 语音识别服务地址",
      "error.invalid-speechCheckEnabled": "句首检查设置无效，请重新切换后保存",
      "error.invalid-size": "音频不能为空或超过 20 MB",
      "error.unsupported-format": "请上传 WAV、MP3、M4A、FLAC 或 OGG 文件",
      "error.playback-failed": "音频播放失败，请重试",
      "error.upstream-failed": "语音服务请求失败，请检查连接与设置",
      "error.upstream-timeout": "语音服务响应超时，请确认模型已就绪后重试",
      "error.upstream-unreachable": "语音服务暂未连接",
      "error.speech-opening-mismatch": "语音开头仍有漏读，请重试",
      "error.speech-check-unavailable": "暂时无法检查语音开头，请检查识别服务后重试",
      "error.invalid-audio-response": "服务未返回有效音频，请检查模型和合成接口",
      "error.invalid-script": "朗读稿的标签格式无效，请重新生成 Auto Tag",
      "error.text-required": "没有可朗读的文字",
      "warning.summary-fallback": "精简暂不可用，已保留原文",
      "warning.tag-fallback": "语气编排暂不可用，使用无标签朗读稿",
      "warning.fallback": "文本处理未完整应用，已采用可用的朗读稿",
      "settings.prepare": "精简 + Auto Tag",
      "settings.autoTag": "Auto Tag",
      "warning.preparation-unavailable": "文本处理服务不可用，已使用原文继续朗读",
      "warning.preparation-invalid": "文本处理结果无效，已使用原文继续朗读",
      "warning.summary-rejected": "精简稿未通过校验，已保留原文",
      "warning.tags-rejected": "语气标签未通过校验，已使用无标签朗读稿",
      "error.reference-too-large": "参考音频超过 20 MB，请上传更短的清晰片段",
      "settings.condense": "精简朗读稿",
      "settings.preparePlain": "预览朗读稿",
      "settings.pronunciationEnabled": "专业术语读法",
      "settings.pronunciationEnabled.hint": "使用内置技术术语读法，让中英文衔接更自然；预览保留原拼写，实际发音仍需试听核对。",
      "settings.pronunciationLexicon": "自定义术语读法",
      "settings.pronunciationLexicon.hint": "每行填写“术语 = 读法”，最多 100 条。只填普通文字，不使用标签；自定义读法覆盖内置读法。",
      "settings.pronunciationLexicon.placeholder": "KV cache = K V 缓存",
      "preview.directedScript": "精简稿与语气（保留术语原拼写）",
      "preview.pronunciations": "本次术语读法",
      "preview.phoneme": "英语发音 {reading}",
      "preview.pronunciationHint": "下列读法用于本次合成，不修改聊天原文。",
      "preview.synthesisText": "发送给语音模型的文本",
      "preview.synthesisHint": "这是实际合成输入，可能含发音控制标记；核对正文请看上方朗读稿。",
      "preview.originalText": "原回复对照",
      "preview.cleanedText": "清理后的原文对照",
      "preview.omittedCode": "{count} 处长代码或命令保留在原回复中，不逐字朗读。",
      "warning.summary-rejected.invalid-structure": "精简结果格式不正确，已回退到原文内容。",
      "warning.summary-rejected.expanded": "精简稿比原文更长，已回退到原文内容。",
      "warning.summary-rejected.new-numeric-value": "精简稿引入了原文没有的数字{values}，已回退到原文内容。",
      "warning.summary-rejected.changed-identifier": "精简稿改变了技术标识{values}，已回退到原文内容。",
      "error.invalid-pronunciation-lexicon": "术语读法格式无效，请按“术语 = 读法”逐行填写普通文本，最多 100 条",
      "error.invalid-pronunciation-enabled": "专业术语读法设置无效，请重新切换后保存",
      "error.invalid-pronunciationEnabled": "专业术语读法设置无效，请重新切换后保存",
      "settings.wholeReplyEnabled": "短回复整段连贯合成",
      "settings.wholeReplyEnabled.hint": "短回复尽量一次合成，减少句间切段；首段等待可能稍长。关闭后按分段目标生成，通常能更早开始播放。",
      "preview.mode.whole-reply": "整段连贯合成",
      "preview.mode.segmented": "分段合成",
      "preview.segmentation.long-reply": "回复较长，按自然句子分段合成。",
      "preview.segmentation.payload-limit": "发音和语气标记展开后超出单次长度，已分段合成。",
      "preview.segmentation.disabled": "已关闭整段合成，按分段目标生成以减少开始播放前的等待。",
      "preview.prosody": "句间衔接与重点",
      "preview.prosody.fallback": "韵律计划未匹配原文，已使用自然断句。",
      "preview.prosody.explain": "解释",
      "preview.prosody.contrast": "转折",
      "preview.prosody.caution": "提醒",
      "preview.prosody.next-step": "下一步",
      "preview.prosody.closing": "收尾",
      "preview.prosody.emphasis": "强调：{text}",
      "preview.prosody.short": "句后短停顿",
      "preview.prosody.slower": "放缓",
      "preview.prosody.delivery": "语气：{text}",
      "error.invalid-wholeReplyEnabled": "整段合成设置无效，请重新切换后保存",
    }

    const en = {
      'action.speak': 'Read aloud',
      'action.stop': 'Stop reading',
      'action.speak.aria': 'Read this reply aloud',
      'action.busy': 'Synthesizing…',
      'error.failed': 'Read-aloud failed',
      'error.textRequired': 'This reply has no readable text',
      'error.upstream': 'Speech service unavailable',
      'error.apiKeyRequired': 'Set an API key in settings first',
      'error.referenceRequired': 'Choose a reference clip in settings first',
      'input.autoRead': 'Auto-read',
      'input.autoRead.on': 'Auto-read: on',
      'input.autoRead.off': 'Auto-read: off',
      'input.playing': 'Reading aloud… click to stop',
      'input.stop': 'Stop reading',
      'player.label': 'Read-aloud player',
      'player.pause': 'Pause',
      'player.play': 'Resume',
      'player.seek': 'Click to seek',
      'player.download': 'Download this clip',
      'player.close': 'Stop reading',
      'player.tags': 'Tone',
      'player.tags.title': 'Directions used for this read-aloud (hover for the full script)',
      'settings.label': 'Read aloud',
      'settings.title': 'Read aloud (Drama 3)',
      'settings.subtitle': 'Send replies to a local vLLM-Omni Drama 3 deployment or the Fish Audio API; the voice comes from a reference clip.',
      'settings.provider': 'Provider',
      'settings.provider.local': 'Local vLLM-Omni (OpenAI-compatible)',
      'settings.provider.fish': 'Fish Audio cloud',
      'settings.baseUrl': 'Endpoint',
      'settings.baseUrl.hint.local': 'e.g. http://127.0.0.1:18190',
      'settings.baseUrl.hint.fish': 'default https://api.fish.audio',
      'settings.model': 'Model',
      'settings.model.hint.local': 'An id from /v1/models, e.g. /home/models/drama-3',
      'settings.model.hint.fish': 'e.g. s2.1-pro-free, s2.1-pro, drama-3',
      'settings.apiKey': 'API key',
      'settings.apiKey.placeholder': 'Empty for a local server; required for the cloud',
      'settings.apiKey.saved': 'Saved — leave empty to keep it',
      'settings.apiKey.clear': 'Clear',
      'settings.refAudio': 'Reference clip',
      'settings.refAudio.none': 'None',
      'settings.refAudio.placeholder': 'Host path, e.g. /home/local/molou/ref/ref_zh.wav',
      'settings.refAudio.upload': 'Upload audio',
      'settings.refAudio.uploading': 'Uploading…',
      'settings.refText': 'Reference transcript',
      'settings.refText.placeholder': 'Exactly what the reference clip says',
      'settings.voiceId': 'Voice ID',
      'settings.voiceId.hint': 'Choose a specific Fish voice; the preset fills in 嘉岚3.0',
      'settings.tagMode': 'Bracket tags',
      'settings.tagMode.strip': 'Drop them (recommended for replies)',
      'settings.tagMode.keep': 'Keep as performance directions',
      'settings.tagMode.hint': 'Drama 3 reads [sighs] as a direction; reply text usually should not carry them.',
      'settings.maxChars': 'Segment size',
      'settings.maxChars.hint': 'Used for long replies or when whole-reply synthesis is off; split at natural punctuation and play as segments arrive',
      'settings.format': 'Audio format',
      'settings.status': 'Connection',
      'settings.status.check': 'Check',
      'settings.status.checking': 'Checking…',
      'settings.status.ok': 'Reachable',
      'settings.status.down': 'Unreachable',
      'settings.status.models': 'Models',
      'settings.save': 'Save',
      'settings.saving': 'Saving…',
      'settings.saved': 'Saved',
      'settings.beep': 'Output test (beep)',
      'settings.download': 'Download this clip',
      'settings.output': 'Output',
      'settings.test': 'Preview',
      'settings.testing': 'Synthesizing…',
      'settings.playing': 'Playing…',
      'settings.played': 'Finished playing',
      'settings.stop': 'Stop',
      'settings.speed': 'Speed',
      'settings.speed.hint': 'Start at 1.0 to compare with the reference, then adjust the pace',
      'settings.tagEnabled': 'Tone and sentence prosody',
      'settings.tagEnabled.on': 'Auto (recommended)',
      'settings.tagEnabled.off': 'Off',
      'settings.tagEnabled.hint': 'Use context to shape explanations, transitions and endings with restrained emphasis and pauses. Expand the preview to see the applied sentence plan.',
      'settings.tagMax': 'Max tags per reply',
      'settings.invalidUrl': 'The endpoint must be an http(s) URL',
      'settings.uploadFailed': 'Upload failed',
      "player.script": "Script",
      "player.viewScript": "View spoken text",
      "player.hideScript": "Hide spoken text",
      "player.voiceDetails": "Tone and pronunciation details",
      "player.errorTitle": "Unable to read aloud",
      "player.preparing": "Preparing script…",
      "player.buffering": "Generating audio…",
      "player.finished": "Playback finished",
      "player.retry": "Play again",
      "player.errorRetry": "Retry",
      "player.downloadAll": "Download audio",
      "player.summary": "Condensed",
      "player.original": "Original wording",
      "player.warnings": "Processing notes",
      "player.part": "Part {n}",
      "player.segmentProgress": "Part {n} / {total}",
      "settings.flow": "Condense → Direct the delivery → Synthesize the reference voice",
      "settings.preset": "Use 嘉岚3.0 · Fish Audio",
      "settings.preset.hint": "Use the website’s voice ID with Drama 3. Requires a Fish Audio API key; generation uses your account credits.",
      "settings.preset.applied": "嘉岚3.0 preset filled in; save to apply",
      "settings.local.hint": "Choose a clear recording of your preferred voice with its exact transcript. The recording, model version and sampling settings affect similarity.",
      "settings.voice": "Voice and connection",
      "settings.script": "Spoken content",
      "settings.summaryEnabled": "Condense replies",
      "settings.summaryEnabled.hint": "Keep conclusions, important numbers and next steps; remove repetition. The original chat reply stays intact.",
      "settings.summaryMaxChars": "Target length",
      "settings.summaryMaxChars.hint": "A target, not a hard cut. Essential details may make the spoken script longer.",
      "settings.on": "On",
      "settings.off": "Off",
      "settings.advanced": "Advanced settings",
      "settings.tagBaseUrl": "Text processing endpoint",
      "settings.tagApiKey": "Text processing API key",
      "settings.speechCheckEnabled": "Check Chinese sentence openings",
      "settings.speechCheckEnabled.hint": "Check eligible Chinese opening sentences in each segment and regenerate once if words are missing. Adds waiting time; does not verify full content or English pronunciation.",
      "settings.speechCheckBaseUrl": "Speech recognition endpoint",
      "settings.speechCheckBaseUrl.hint": "Generated audio is sent to this endpoint to check the opening.",
      "settings.speechCheckModel": "Speech recognition model",
      "settings.previewText": "Preview text",
      "settings.previewContext": "Preview context (optional)",
      "settings.previewContext.hint": "For example: the user wants a brief, calm troubleshooting update.",
      "settings.previewContext.placeholder": "Describe the situation for this reply",
      "settings.preview.hint": "Preview saves these settings and shows the actual spoken script. It uses credits from your selected provider.",
      "settings.preview.hint.local": "Preview the condensed script and directions, then listen using your local model. Preview saves the current settings.",
      "settings.previewAction": "Save and preview",
      "settings.dirty": "Unsaved changes",
      "settings.checkAction": "Save and check",
      "settings.retryLoad": "Reload",
      "settings.loadFailed": "Could not load settings. Check that dsh is running.",
      "settings.uploaded": "Reference uploaded. Add its transcript and save.",
      "settings.uploadFormats": "WAV, MP3, M4A, FLAC or OGG; up to 20 MB",
      "settings.readiness": "Before previewing, add:",
      "settings.referenceTextRequired": "Exact reference transcript",
      "settings.voiceRequired": "Voice ID",
      "settings.unsaved": "Changes have not been saved",
      "settings.tagModel": "Text processing model",
      "settings.tagModel.hint": "An OpenAI-compatible model ID for condensation and tone direction.",
      "settings.refAudio.saved": "Uploaded recordings",
      "settings.clearKey": "Save key removal",
      "settings.resetSpeed": "Original speed",
      "error.audio-locked": "Playback needs a browser gesture. Click retry.",
      "error.empty-audio": "The speech service returned empty audio. Retry.",
      "error.reference-required": "Choose a reference recording",
      "error.reference-text-required": "Enter the exact reference transcript",
      "error.ref-text-required": "Enter the exact reference transcript",
      "error.api-key-required": "Enter your Fish Audio API key",
      "error.voice-id-required": "Enter a voice ID",
      "error.reference-not-found": "Reference recording not found. Upload it again or check the path.",
      "error.invalid-base-url": "Enter a valid http(s) speech endpoint",
      "error.invalid-tag-base-url": "Enter a valid http(s) text processing endpoint",
      "error.invalid-speech-check-base-url": "Enter a valid http(s) speech recognition endpoint",
      "error.invalid-speechCheckEnabled": "Invalid opening check setting. Toggle it again and save.",
      "error.invalid-size": "Audio must be nonempty and at most 20 MB",
      "error.unsupported-format": "Upload WAV, MP3, M4A, FLAC or OGG",
      "error.playback-failed": "Audio playback failed. Retry.",
      "error.upstream-failed": "Speech request failed. Check the connection and settings.",
      "error.upstream-timeout": "Speech timed out. Check that the model is ready, then retry.",
      "error.upstream-unreachable": "The speech service is unavailable.",
      "error.speech-opening-mismatch": "The audio still omits the opening. Please retry.",
      "error.speech-check-unavailable": "Could not check the audio opening. Check the recognition service and retry.",
      "error.invalid-audio-response": "The service did not return valid audio. Check the model and speech endpoint.",
      "error.invalid-script": "The script contains invalid tags. Generate Auto Tag again.",
      "error.text-required": "No readable text",
      "warning.summary-fallback": "Condensation unavailable; kept original text",
      "warning.tag-fallback": "Tone direction unavailable; using plain speech",
      "warning.fallback": "Text processing was incomplete; using the available script",
      "settings.prepare": "Condense + Auto Tag",
      "settings.autoTag": "Auto Tag",
      "warning.preparation-unavailable": "Text processing unavailable; reading the original text",
      "warning.preparation-invalid": "Invalid text processing result; reading the original text",
      "warning.summary-rejected": "Condensed script failed validation; kept original text",
      "warning.tags-rejected": "Tone tags failed validation; using plain speech",
      "error.reference-too-large": "Reference audio exceeds 20 MB. Upload a shorter clean clip.",
      "settings.condense": "Condense script",
      "settings.preparePlain": "Preview script",
      "settings.pronunciationEnabled": "Technical pronunciation",
      "settings.pronunciationEnabled.hint": "Use built-in technical pronunciations for smoother mixed-language speech. Preview keeps original spelling; listen to verify pronunciation.",
      "settings.pronunciationLexicon": "Custom pronunciations",
      "settings.pronunciationLexicon.hint": "One “term = reading” per line, up to 100 entries. Use plain text without tags; custom readings override built-in readings.",
      "settings.pronunciationLexicon.placeholder": "KV cache = K V 缓存",
      "preview.directedScript": "Condensed script and direction (original term spelling)",
      "preview.pronunciations": "Pronunciations used",
      "preview.phoneme": "English pronunciation {reading}",
      "preview.pronunciationHint": "These readings are used for this synthesis; the original reply stays unchanged.",
      "preview.synthesisText": "Text sent to the speech model",
      "preview.synthesisHint": "The actual synthesis input may contain pronunciation controls. Read the script above to review content.",
      "preview.originalText": "Compare original reply",
      "preview.cleanedText": "Compare cleaned original text",
      "preview.omittedCode": "{count} long code or command passages remain in the original reply and are not read verbatim.",
      "warning.summary-rejected.invalid-structure": "The condensed result had an invalid structure; using the original content.",
      "warning.summary-rejected.expanded": "The condensed script was longer than the original; using the original content.",
      "warning.summary-rejected.new-numeric-value": "The condensed script introduced new numbers{values}; using the original content.",
      "warning.summary-rejected.changed-identifier": "The condensed script changed technical identifiers{values}; using the original content.",
      "error.invalid-pronunciation-lexicon": "Use one plain-text “term = reading” per line, up to 100 entries, without tags.",
      "error.invalid-pronunciation-enabled": "Invalid pronunciation setting. Toggle it again and save.",
      "error.invalid-pronunciationEnabled": "Invalid pronunciation setting. Toggle it again and save.",
      "settings.wholeReplyEnabled": "Synthesize short replies together",
      "settings.wholeReplyEnabled.hint": "Generate a short reply in one pass for smoother transitions; initial audio may take longer. Turn off to generate smaller segments and usually start playback sooner.",
      "preview.mode.whole-reply": "Continuous whole-reply synthesis",
      "preview.mode.segmented": "Segmented synthesis",
      "preview.segmentation.long-reply": "This longer reply is synthesized in natural sentence segments.",
      "preview.segmentation.payload-limit": "Pronunciation and direction markup exceeds the single-request limit; synthesis is segmented.",
      "preview.segmentation.disabled": "Whole-reply synthesis is off. The segment target is used to reduce the wait before playback.",
      "preview.prosody": "Transitions and emphasis",
      "preview.prosody.fallback": "The prosody plan did not match the wording; using natural sentence breaks.",
      "preview.prosody.explain": "Explanation",
      "preview.prosody.contrast": "Contrast",
      "preview.prosody.caution": "Caution",
      "preview.prosody.next-step": "Next step",
      "preview.prosody.closing": "Closing",
      "preview.prosody.emphasis": "Emphasis: {text}",
      "preview.prosody.short": "Short pause after sentence",
      "preview.prosody.slower": "Slower delivery",
      "preview.prosody.delivery": "Tone: {text}",
      "error.invalid-wholeReplyEnabled": "Invalid whole-reply setting. Toggle it again and save.",
    }

    /* ------------------------------------------------------------ utilities */

    function withSettingsDefaults(config) {
      return { ...SETTINGS_COMPATIBILITY_DEFAULTS, ...config }
    }

    function readAutoRead(win) {
      try {
        return win.localStorage.getItem(AUTO_KEY) !== '0'
      } catch {
        return true
      }
    }

    function writeAutoRead(win, value) {
      try {
        win.localStorage.setItem(AUTO_KEY, value ? '1' : '0')
      } catch {
        /* private mode: the switch still works for this page */
      }
    }

    async function postJson(path, payload, signal) {
      const response = await fetch(`${PREFIX}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      })
      const type = response.headers.get('content-type') ?? ''
      if (response.ok && type.startsWith('audio/')) return { audio: await response.blob() }
      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      if (!response.ok || body?.ok === false) {
        const error = new Error(body?.error ?? 'request-failed')
        error.code = body?.error ?? 'request-failed'
        error.detail = body?.detail
        throw error
      }
      return body ?? {}
    }

    async function getJson(path) {
      const response = await fetch(`${PREFIX}${path}`, { headers: { Accept: 'application/json' } })
      const body = await response.json().catch(() => null)
      if (!response.ok || body?.ok === false) {
        const error = new Error(body?.error ?? 'request-failed')
        error.code = body?.error ?? 'request-failed'
        throw error
      }
      return body
    }

    function errorLabel(t, code) {
      const key = `error.${code ?? 'failed'}`
      const label = t(key)
      return label === key ? `${t('error.failed')} (${String(code ?? 'failed')})` : label
    }
    function warningLabel(t, warning, plan) {
      const code = typeof warning === 'string' ? warning : warning?.code
      if (code === 'summary-rejected' && plan?.summaryRejection?.reason) {
        const detailKey = `warning.summary-rejected.${plan.summaryRejection.reason}`
        const detail = t(detailKey)
        if (detail !== detailKey) {
          const values = Array.isArray(plan.summaryRejection.values)
            ? plan.summaryRejection.values.filter((value) => ['string', 'number'].includes(typeof value)).slice(0, 8).map(String).join(', ') : ''
          return detail.replace('{values}', values ? ` (${values})` : '')
        }
      }
      const key = `warning.${code}`
      const label = t(key)
      return label === key ? `${t('warning.fallback')} (${String(code ?? '')})` : label
    }
    const clipExtension = (clip) => (clip?.type?.includes('wav') ? 'wav' : 'mp3')

    /* --------------------------------------------------------------- audio */

    /**
     * One output path for the page. Web Audio keeps the element autoplay policy
     * out of the way, resumes inside the user's gesture, and lets the docked
     * player show real progress, pause, seek and a waveform built from the clip.
     */
    function createAudioEngine(getPlayback) {
      let context = null

      const ensure = () => {
        if (context !== null) return context
        const Ctor = window.AudioContext ?? window.webkitAudioContext
        if (Ctor === undefined) return null
        context = new Ctor()
        return context
      }

      /** Resume inside a gesture handler; safe to call repeatedly. */
      const unlock = () => {
        const audio = ensure()
        if (audio !== null && audio.state !== 'running') void audio.resume().catch(() => {})
      }

      /** Normalized peak per bar, so the bar shape follows the actual clip. */
      const peaksOf = (buffer, count) => {
        const data = buffer.getChannelData(0)
        const step = Math.max(1, Math.floor(data.length / count))
        const peaks = []
        for (let bar = 0; bar < count; bar += 1) {
          let peak = 0
          const from = bar * step
          for (let index = 0; index < step; index += 1) {
            const value = Math.abs(data[from + index] ?? 0)
            if (value > peak) peak = value
          }
          peaks.push(peak)
        }
        const max = Math.max(...peaks, 1e-6)
        return peaks.map((value) => Math.max(0.08, value / max))
      }

      const playElement = (blob, control, report) => new Promise((resolve, reject) => {
        if (control.cancelled) return resolve()
        const url = URL.createObjectURL(blob)
        const element = new Audio(url)
        const { rate, volume } = getPlayback()
        element.playbackRate = rate
        element.volume = volume
        control.audio = element
        control.url = url
        let finished = false
        const finish = (error) => {
          if (finished) return
          finished = true
          element.onended = element.onerror = element.ontimeupdate = element.onloadedmetadata = null
          element.pause()
          element.src = ''
          URL.revokeObjectURL(url)
          control.audio = null
          control.url = null
          if (error) reject(error)
          else resolve()
        }
        const tick = () => report?.({ kind: 'tick', time: element.currentTime, duration: element.duration || 0, paused: element.paused })
        control.stop = () => finish()
        control.pause = () => { element.pause(); tick() }
        control.resume = () => { element.play().then(tick).catch(finish) }
        control.seek = (seconds) => {
          if (Number.isFinite(element.duration)) element.currentTime = Math.max(0, Math.min(seconds, element.duration))
          tick()
        }
        element.onended = () => finish()
        element.onerror = () => finish(new Error('playback-failed'))
        element.onloadedmetadata = () => report?.({ kind: 'ready', bars: [], duration: element.duration || 0 })
        element.ontimeupdate = tick
        element.play().catch(finish)
      })

      /**
       * Play one clip and report its identity, position and transport.
       * @param control - caller-owned cancellation plus pause/resume/seek handles.
       * @param report - receives `ready` once and `tick` while the clip runs.
       */
      const play = async (blob, control, report) => {
        const audio = ensure()
        if (audio === null) return playElement(blob, control, report)
        unlock()
        const bytes = await blob.arrayBuffer()
        if (control.cancelled) return
        const buffer = await audio.decodeAudioData(bytes)
        if (control.cancelled) return

        const duration = buffer.duration
        const bars = peaksOf(buffer, 56)
        let offset = 0
        let source = null
        let startedAt = 0
        let paused = false
        let finished = false
        let settle = () => {}

        const stopSource = () => {
          if (source === null) return
          const node = source
          source = null
          node.onended = null
          try {
            node.stop()
          } catch {
            /* already stopped */
          }
        }

        const position = () => (paused ? offset : offset + Math.max(0, audio.currentTime - startedAt) * getPlayback().rate)

        const startAt = (at) => {
          stopSource()
          const node = audio.createBufferSource()
          const gain = audio.createGain()
          const { rate, volume } = getPlayback()
          node.buffer = buffer
          node.playbackRate.value = rate
          gain.gain.value = volume
          node.connect(gain)
          gain.connect(audio.destination)
          node.onended = () => {
            if (finished || paused || control.cancelled) return
            finished = true
            settle()
          }
          source = node
          startedAt = audio.currentTime
          node.start(0, at)
        }

        control.stop = () => {
          stopSource()
          if (!finished) {
            finished = true
            settle()
          }
        }
        control.pause = () => {
          if (paused) return
          offset = Math.min(position(), duration)
          paused = true
          stopSource()
          report?.({ kind: 'tick', time: offset, duration, paused: true })
        }
        control.resume = () => {
          if (!paused || control.cancelled) return
          unlock()
          paused = false
          startAt(offset)
          report?.({ kind: 'tick', time: offset, duration, paused: false })
        }
        control.seek = (seconds) => {
          const target = Math.max(0, Math.min(seconds, Math.max(0, duration - 0.05)))
          offset = target
          if (!paused) startAt(target)
          report?.({ kind: 'tick', time: target, duration, paused })
        }

        if (audio.state === 'suspended') {
          const error = new Error('audio-locked')
          error.code = 'audio-locked'
          throw error
        }
        const completed = new Promise((resolve) => { settle = resolve })
        report?.({ kind: 'ready', bars, duration })
        startAt(0)
        const timer = setInterval(() => {
          if (control.cancelled || finished) return
          report?.({ kind: 'tick', time: position(), duration, paused })
        }, 160)
        await completed
        clearInterval(timer)
        stopSource()
      }

      return {
        unlock,
        play,
        state: () => (context === null ? 'none' : context.state),
        sampleRate: () => (context === null ? 0 : context.sampleRate),
      }
    }

    /* --------------------------------------------------------------- player */

    /** One reader per page: segments synthesize ahead of playback, one voice at a time. */
    function createPlayer(engine) {
      const listeners = new Set()
      let session = null
      let lastRequest = null
      const initial = {
        messageId: null, sessionId: null, status: 'idle', segment: 0, total: 0,
        time: 0, duration: 0, bars: [], paused: false, clip: null,
        clips: [], script: '', spokenText: '', cleanedText: '', originalText: '', synthesisText: '',
        pronunciationChanges: [], omittedCode: 0, summaryRejection: null,
        synthesisMode: null, spokenUnits: null, segmentationReason: null,
        prosody: [], prosodySource: null, prosodyStatus: 'disabled', prosodyError: null,
        tagged: false, summarized: false, warnings: [], error: null,
      }
      let state = { ...initial }
      const setState = (patch) => {
        state = { ...state, ...patch }
        for (const listener of listeners) listener()
      }
      function stop() {
        if (session !== null) {
          session.cancelled = true
          session.abort.abort()
          session.stop?.()
          session = null
        }
        setState({ ...initial })
      }
      const transport = (name, ...args) => session?.[name]?.(...args)

      async function speak(messageId, text, context = [], preparedPlan = null, sessionId = null) {
        stop()
        if (String(text ?? '').trim() === '') {
          const error = new Error('textRequired')
          error.code = 'textRequired'
          setState({ status: 'error', error: error.code, messageId, sessionId })
          throw error
        }
        const control = { cancelled: false, abort: new AbortController(), stop: null, pause: null, resume: null, seek: null }
        const current = () => !control.cancelled && session === control
        session = control
        lastRequest = { messageId, text, context, preparedPlan, sessionId }
        setState({ ...initial, status: 'planning', messageId, sessionId })
        try {
          const plan = preparedPlan ?? await postJson('/plan', { text, context }, control.abort.signal)
          if (!current()) return
          const segments = Array.isArray(plan.segments) ? plan.segments : []
          if (segments.length === 0) throw Object.assign(new Error('textRequired'), { code: 'textRequired' })
          setState({
            status: 'buffering', total: segments.length,
            script: plan.script ?? plan.scripted ?? text,
            spokenText: plan.spokenText ?? plan.cleaned ?? text,
            cleanedText: plan.cleanedText ?? plan.cleaned ?? text,
            originalText: typeof plan.originalText === 'string' ? plan.originalText : text,
            synthesisText: plan.synthesisText ?? plan.script ?? plan.scripted ?? text,
            pronunciationChanges: Array.isArray(plan.pronunciationChanges) ? plan.pronunciationChanges : [],
            omittedCode: Number.isFinite(plan.omittedCode) ? Math.max(0, Math.floor(plan.omittedCode)) : 0,
            summaryRejection: plan.summaryRejection ?? null,
            synthesisMode: plan.synthesisMode ?? null, spokenUnits: plan.spokenUnits ?? null, segmentationReason: plan.segmentationReason ?? null,
            prosody: Array.isArray(plan.prosody) ? plan.prosody : [],
            prosodySource: plan.prosodySource ?? null, prosodyStatus: plan.prosodyStatus ?? 'disabled', prosodyError: plan.prosodyError ?? null,
            tagged: plan.tagged === true, summarized: plan.summarized === true,
            warnings: Array.isArray(plan.warnings) ? plan.warnings : [],
          })
          // Observe prefetch rejections immediately, even while the preceding clip plays.
          const fetchClip = (index) => postJson('/speech', { text: segments[index] }, control.abort.signal)
            .then((value) => ({ value }), (error) => ({ error }))
          let pending = fetchClip(0)
          const clips = []
          for (let index = 0; index < segments.length; index += 1) {
            const result = await pending
            if (!current()) return
            if (result.error) throw result.error
            const audio = result.value?.audio
            if (!(audio instanceof Blob) || audio.size === 0) throw Object.assign(new Error('empty-audio'), { code: 'empty-audio' })
            pending = index + 1 < segments.length ? fetchClip(index + 1) : null
            clips.push(audio)
            setState({ status: 'speaking', segment: index + 1, clip: audio, clips: [...clips], time: 0, duration: 0, bars: [], paused: false })
            await engine.play(audio, control, (event) => {
              if (!current()) return
              if (event.kind === 'ready') setState({ bars: event.bars, duration: event.duration, time: 0 })
              else if (event.kind === 'tick') setState({ time: event.time, duration: event.duration, paused: event.paused })
            })
            if (!current()) return
            control.pause = control.resume = control.seek = null
            if (index + 1 < segments.length) setState({ status: 'buffering' })
          }
          if (current()) {
            session = null
            setState({ status: 'done', paused: false, time: state.duration })
          }
        } catch (error) {
          if (!current()) return
          control.abort.abort()
          control.stop?.()
          session = null
          setState({ status: 'error', paused: false, error: error?.code ?? error?.message ?? 'failed', messageId })
          throw error
        }
      }
      return {
        speak, stop,
        retry: () => { engine.unlock(); return lastRequest ? speak(lastRequest.messageId, lastRequest.text, lastRequest.context, lastRequest.preparedPlan, lastRequest.sessionId) : Promise.resolve() },
        pause: () => transport('pause'), resume: () => transport('resume'), seek: (seconds) => transport('seek', seconds),
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        get: () => state,
        playingFor: (id) => state.messageId === id && state.status === 'speaking',
        pendingFor: (id) => state.messageId === id && ['planning', 'buffering'].includes(state.status),
        output: () => engine.state(),
      }
    }

    /* ------------------------------------------------------------- icons */

    function SpeakerIcon({ active, busy, size = 16 }) {
      return React.createElement('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.25,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { width: size, height: size, display: 'block', flexShrink: 0, opacity: busy ? 0.5 : 1 },
        'aria-hidden': 'true',
      },
        React.createElement('path', { d: 'M1.25 5.75H3.5L8 1.5v13L3.5 10.25H1.25z' }),
        active
          ? React.createElement('path', { d: 'M10.5 5a4.25 4.25 0 0 1 0 6M12.5 2.75a7.5 7.5 0 0 1 0 10.5' })
          : React.createElement('path', { d: 'M10.75 5.25l4 5.5M14.75 5.25l-4 5.5' }),
      )
    }

    /* ------------------------------------------------------- message action */

    function selectText(snapshot, messageId) {
      for (const node of snapshot?.nodes ?? []) {
        if (node.kind !== 'assistant' || node.messageId !== messageId) continue
        return (node.blocks ?? [])
          .filter((block) => block.kind === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('\n')
      }
      return ''
    }

    function selectContext(snapshot, messageId) {
      const nodes = snapshot?.nodes ?? []
      const target = nodes.find((node) => node.kind === 'assistant' && node.messageId === messageId)
      if (!target) return '[]'
      const entries = nodes.filter((node) => node.seq < target.seq && (node.kind === 'user' || node.kind === 'assistant'))
        .sort((a, b) => a.seq - b.seq).slice(-6).map((node) => ({
          role: node.kind,
          content: (node.kind === 'user'
            ? (node.content ?? []).filter((block) => block.type === 'text').map((block) => block.text)
            : (node.blocks ?? []).filter((block) => block.kind === 'text').map((block) => block.text))
            .join('\n').slice(0, 1000),
        })).filter((entry) => entry.content.trim())
      let remaining = 4000
      const bounded = []
      for (const entry of entries.reverse()) {
        if (remaining === 0) break
        const content = entry.content.slice(0, remaining)
        remaining -= content.length
        bounded.unshift({ ...entry, content })
      }
      return JSON.stringify(bounded)
    }

    function selectIsLatest(snapshot, messageId) {
      let latest = null
      for (const node of snapshot?.nodes ?? []) {
        if (node.kind !== 'assistant' || node.messageId === undefined) continue
        const order = [node.turn ?? 0, node.step ?? 0, node.seq ?? 0]
        if (latest === null || order[0] > latest[0]
          || (order[0] === latest[0] && order[1] > latest[1])
          || (order[0] === latest[0] && order[1] === latest[1] && order[2] > latest[2])) {
          latest = order
          latest.messageId = node.messageId
        }
      }
      return latest !== null && latest.messageId === messageId
    }

    function selectTime(snapshot, messageId) {
      for (const node of snapshot?.nodes ?? []) {
        if (node.kind === 'assistant' && node.messageId === messageId) return node.time ?? 0
      }
      return 0
    }

    function Actions(props) {
      const { messageId, useChat, player, autoRead, loadTime, played, t, unlock, sessionId, watermarks } = props
      const readKey = JSON.stringify([sessionId ?? null, messageId])
      const text = useChat((snapshot) => selectText({ nodes: snapshot.legacy.nodes }, messageId))
      const isLatest = useChat((snapshot) => selectIsLatest({ nodes: snapshot.legacy.nodes }, messageId))
      const time = useChat((snapshot) => selectTime({ nodes: snapshot.legacy.nodes }, messageId))
      const context = useChat((snapshot) => selectContext({ nodes: snapshot.legacy.nodes }, messageId))
      const seq = useChat((snapshot) => snapshot.legacy.nodes.find((node) => node.kind === 'assistant' && node.messageId === messageId)?.seq ?? 0)
      const [failure, setFailure] = React.useState(null)
      const busy = React.useSyncExternalStore(player.subscribe, () => player.pendingFor(messageId), () => false)
      const active = React.useSyncExternalStore(player.subscribe, () => player.playingFor(messageId), () => false)

      React.useEffect(() => {
        if (!autoRead()) return
        if (!isLatest || String(text).trim() === '') return
        if (sessionId !== undefined && watermarks) {
          const entered = watermarks.get(sessionId)
          if (!entered || seq <= entered.seq || time <= entered.time) return
        } else if (time <= loadTime) return
        if (played.has(readKey)) return
        // This records an attempt, including failure or cancellation. Clearing
        // it on error lets later renders/remounts restart the entire reply.
        played.add(readKey)
        player.speak(messageId, text, JSON.parse(context), null, sessionId).catch((error) => setFailure(error?.code ?? 'failed'))
      }, [isLatest, text, time, messageId, player, autoRead, loadTime, played, context, seq, sessionId, watermarks, readKey])

      if (String(text).trim() === '') return null
      const onClick = () => {
        // Resume the audio context inside this click before any await.
        unlock?.()
        setFailure(null)
        // A manual start/stop also consumes automatic playback for this reply;
        // later UI updates must not interrupt it with a second automatic read.
        played.add(readKey)
        if (busy || active) {
          player.stop()
          return
        }
        player.speak(messageId, text, JSON.parse(context), null, sessionId).catch((error) => setFailure(error?.code ?? 'failed'))
      }
      return React.createElement('button', {
        type: 'button',
        'data-drama3-tts': messageId,
        'data-active': active || undefined,
        'aria-label': busy || active ? t('action.stop') : t('action.speak.aria'),
        title: failure === null
          ? (busy ? t('action.busy') : active ? t('action.stop') : t('action.speak'))
          : t(`error.${failure}`) === `error.${failure}` ? t('error.failed') : t(`error.${failure}`),
        onClick,
        style: {
          background: 'none',
          border: 'none',
          width: 'calc(28px + var(--dsh-content-font-delta, 0px))',
          height: 'calc(28px + var(--dsh-content-font-delta, 0px))',
          padding: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: failure !== null
            ? 'var(--dsh-color-danger, #e5484d)'
            : active ? 'var(--dsw-alias-state-business-primary, #4d93f8)' : 'var(--dsw-alias-label-tertiary, #7a7a7a)',
        },
      }, React.createElement(SpeakerIcon, { active, busy, size: 'calc(17px + var(--dsh-content-font-delta, 0px))' }))
    }

    /* --------------------------------------------------------- composer seat */

    /** Hover/focus bubble with a short delay; native `title` stays as a fallback. */
    function Hint({ label, children }) {
      const [open, setOpen] = React.useState(false)
      const [position, setPosition] = React.useState(null)
      const anchor = React.useRef(null)
      const show = () => {
        const rect = anchor.current?.getBoundingClientRect()
        if (rect !== undefined) setPosition({ left: rect.left + rect.width / 2, top: rect.top - 6 })
        setOpen(true)
      }
      const hide = () => setOpen(false)
      return React.createElement('span', {
        ref: anchor,
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
        style: { display: 'inline-flex', alignItems: 'center' },
      },
      children,
      open && position !== null
        ? React.createElement('span', {
          role: 'tooltip',
          className: 'drama3-tts-hint',
          style: { left: position.left, top: position.top },
        }, label)
        : null)
    }

    /** Animated level bars shown while a reply is being read. */
    function WaveBars() {
      return React.createElement('span', { className: 'drama3-tts-bars', 'aria-hidden': 'true' },
        React.createElement('i'), React.createElement('i'), React.createElement('i'), React.createElement('i'))
    }

    // Input slots remain mounted while a conversation receives new replies.
    // Establish the baseline here, not on each newly mounted message action.
    function AutoReadWatermark({ sessionId, useChat, watermarks }) {
      const seq = useChat((snapshot) => (snapshot.legacy?.nodes ?? []).reduce((max, node) => Math.max(max, node.seq ?? 0), 0))
      React.useEffect(() => {
        const entry = { seq, time: Date.now() }
        watermarks.set(sessionId, entry)
        return () => { if (watermarks.get(sessionId) === entry) watermarks.delete(sessionId) }
      }, [sessionId, watermarks])
      return null
    }

    function ComposerToggle(props) {
      const { read, set, subscribe, t, player, unlock, sessionId, useChat, watermarks } = props
      const enabled = React.useSyncExternalStore(subscribe, read, read)
      const snapshot = React.useSyncExternalStore(player.subscribe, player.get, player.get)
      const reading = ['speaking', 'planning', 'buffering'].includes(snapshot.status)
      const label = reading ? t('input.playing') : enabled ? t('input.autoRead.on') : t('input.autoRead.off')
      const onClick = () => {
        if (reading) {
          player.stop()
          return
        }
        unlock()
        set(!enabled)
      }
      return React.createElement(React.Fragment, null,
        sessionId !== undefined && typeof useChat === 'function' && watermarks
          ? React.createElement(AutoReadWatermark, { sessionId, useChat, watermarks }) : null,
        React.createElement(Hint, { label },
        React.createElement('button', {
          type: 'button',
          title: label,
          'aria-label': label,
          'aria-pressed': enabled,
          'data-drama3-tts-reading': reading || undefined,
          onClick,
          style: {
            background: 'none',
            border: 'none',
            width: 28,
            height: 28,
            padding: 0,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            gap: 2,
            color: reading
              ? 'var(--dsw-alias-state-business-primary, #4d93f8)'
              : enabled ? 'var(--dsw-alias-state-business-primary, #4d93f8)' : 'var(--dsw-alias-label-tertiary, #7a7a7a)',
          },
        },
        reading ? React.createElement(WaveBars) : React.createElement(SpeakerIcon, { active: enabled, busy: false }),
        reading
          ? React.createElement('span', {
            style: { width: 10, height: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
          }, React.createElement('svg', {
            width: 9,
            height: 9,
            viewBox: '0 0 10 10',
            'aria-hidden': 'true',
          }, React.createElement('rect', { x: 1, y: 1, width: 8, height: 8, rx: 1.5, fill: 'currentColor' })))
          : null)))
    }

    /* ------------------------------------------------------- playback bar */

    const PlayGlyph = () => React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true' },
      React.createElement('path', { d: 'M3 1.6v8.8l7-4.4z', fill: 'currentColor' }))
    const PauseGlyph = () => React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true' },
      React.createElement('rect', { x: 2.4, y: 1.8, width: 2.6, height: 8.4, rx: 0.6, fill: 'currentColor' }),
      React.createElement('rect', { x: 7, y: 1.8, width: 2.6, height: 8.4, rx: 0.6, fill: 'currentColor' }))
    const CloseGlyph = () => React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': 'true' },
      React.createElement('path', { d: 'M3 3l6 6M9 3l-6 6' }))
    const AlertGlyph = () => React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': 'true' },
      React.createElement('circle', { cx: 10, cy: 10, r: 7.2 }),
      React.createElement('path', { d: 'M10 6.2v4.5M10 13.6h.01' }))
    const RetryGlyph = () => React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
      React.createElement('path', { d: 'M12.4 5.7A5 5 0 1 0 13 9M12.7 2.5v3.8H9' }))
    const ChevronGlyph = () => React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
      React.createElement('path', { d: 'm3 4.5 3 3 3-3' }))

    const clockOf = (seconds) => {
      const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0))
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
    }

    /** In-flow transport: the composer owns its height, including expanded details. */
    function PlaybackBar(props) {
      const { player, t, sessionId, surface = 'conversation' } = props
      const snapshot = React.useSyncExternalStore(player.subscribe, player.get, player.get)
      const [urls, setUrls] = React.useState([])
      const [scriptVisible, setScriptVisible] = React.useState(false)
      const clips = snapshot.clips ?? []
      const preview = snapshot.messageId === 'drama3-tts:preview'
      const visible = snapshot.status !== 'idle'
        && (surface === 'preview') === preview
        && (preview || snapshot.status !== 'done')
        && (preview || snapshot.sessionId == null || snapshot.sessionId === sessionId)
      React.useEffect(() => {
        const next = visible ? clips.map((clip) => URL.createObjectURL(clip)) : []
        setUrls(next)
        if (!visible) setScriptVisible(false)
        return () => next.forEach((url) => URL.revokeObjectURL(url))
      }, [snapshot.clips, visible])
      if (!visible) return null
      const duration = snapshot.duration || 0
      const time = Math.min(snapshot.time || 0, duration)
      const ratio = duration > 0 ? time / duration : 0
      const bars = Array.isArray(snapshot.bars) ? snapshot.bars : []
      const busy = ['planning', 'buffering'].includes(snapshot.status)
      const done = snapshot.status === 'done'
      const failed = snapshot.status === 'error'
      const retry = () => player.retry?.().catch(() => {})
      const content = React.createElement('div', {
        className: 'drama3-tts-player', role: 'group',
        'aria-label': t('player.label'), 'data-drama3-tts-player': true,
        'data-state': snapshot.status,
      },
      React.createElement('div', { className: 'drama3-tts-player-row' },
        failed ? React.createElement('span', { className: 'drama3-tts-player-alert', 'aria-hidden': true }, React.createElement(AlertGlyph))
          : busy ? React.createElement('span', { className: 'drama3-tts-player-loading', 'aria-hidden': true })
          : React.createElement('button', {
          type: 'button', className: 'drama3-tts-player-play',
          title: t(done ? 'player.retry' : snapshot.paused ? 'player.play' : 'player.pause'),
          'aria-label': t(done ? 'player.retry' : snapshot.paused ? 'player.play' : 'player.pause'),
          onClick: () => {
            if (done) retry()
            else if (snapshot.paused) player.resume()
            else player.pause()
          },
        }, done || snapshot.paused ? React.createElement(PlayGlyph) : React.createElement(PauseGlyph)),
        busy || failed || done
          ? React.createElement('span', { className: 'drama3-tts-player-status', role: failed ? 'alert' : 'status' },
            failed ? React.createElement(React.Fragment, null,
              React.createElement('strong', null, t('player.errorTitle')),
              React.createElement('span', { className: 'drama3-tts-player-reason' }, errorLabel(t, snapshot.error)))
              : t(done ? 'player.finished' : snapshot.status === 'planning' ? 'player.preparing' : 'player.buffering'))
          : React.createElement('div', {
            className: 'drama3-tts-player-wave', title: t('player.seek'), role: 'slider',
            tabIndex: duration > 0 ? 0 : -1, 'aria-label': t('player.seek'),
            'aria-valuemin': 0, 'aria-valuemax': Math.round(duration), 'aria-valuenow': Math.round(time),
            'aria-valuetext': `${clockOf(time)} / ${clockOf(duration)}`,
            onClick: (event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              if (rect.width && duration) player.seek(((event.clientX - rect.left) / rect.width) * duration)
            },
            onKeyDown: (event) => {
              const positions = { ArrowLeft: time - 5, ArrowRight: time + 5, Home: 0, End: duration }
              if (positions[event.key] === undefined) return
              event.preventDefault(); player.seek(positions[event.key])
            },
          }, bars.map((value, index) => React.createElement('i', {
            key: index, style: { height: `${Math.round(5 + value * 17)}px`, opacity: index / Math.max(1, bars.length) <= ratio ? 1 : 0.32 },
          }))),
        snapshot.status === 'speaking' ? React.createElement('span', { className: 'drama3-tts-player-time' }, `${clockOf(time)} / ${clockOf(duration)}`) : null,
        !failed && snapshot.total > 1 ? React.createElement('span', { className: 'drama3-tts-player-seg' }, t('player.segmentProgress').replace('{n}', snapshot.segment).replace('{total}', snapshot.total)) : null,
        failed ? React.createElement('button', {
          type: 'button', className: 'drama3-tts-player-retry', onClick: retry,
          'aria-label': t('player.errorRetry'),
        }, React.createElement(RetryGlyph), t('player.errorRetry')) : null,
        !failed && snapshot.script ? React.createElement('button', {
          type: 'button', className: 'drama3-tts-player-tags', 'aria-expanded': scriptVisible,
          onClick: () => setScriptVisible(!scriptVisible),
        }, t(scriptVisible ? 'player.hideScript' : 'player.viewScript'), React.createElement(ChevronGlyph)) : null,
        React.createElement('button', {
          type: 'button', className: 'drama3-tts-player-icon', title: t('player.close'),
          'aria-label': t('player.close'), onClick: () => player.stop(),
        }, React.createElement(CloseGlyph))),
      scriptVisible && !failed ? React.createElement('div', { className: 'drama3-tts-script' },
        snapshot.spokenText ? React.createElement('div', { className: 'drama3-tts-spoken-text' }, snapshot.spokenText) : null,
        React.createElement(PlanNotes, { plan: snapshot, t, compact: true }),
        React.createElement('details', null,
          React.createElement('summary', null, t('player.voiceDetails')),
          React.createElement(ScriptDetails, { plan: snapshot, t })),
        urls.length ? React.createElement('details', { className: 'drama3-tts-downloads' },
        React.createElement('summary', null, t('player.downloadAll')),
        React.createElement('div', null, urls.map((url, index) => React.createElement('a', {
          key: url, href: url, download: `drama3-tts-${index + 1}.${clipExtension(clips[index])}`,
        }, clips.length === 1 ? t('player.download') : t('player.part').replace('{n}', index + 1))))) : null) : null)
      return content
    }

    /* ------------------------------------------------------------ settings */

    const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }
    const hintStyle = { fontSize: 11, opacity: 0.62, marginTop: 4, lineHeight: 1.45 }
    const inputStyle = {
      width: '100%',
      boxSizing: 'border-box',
      padding: '6px 8px',
      fontSize: 13,
      borderRadius: 6,
      border: '1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.35))',
      background: 'var(--dsw-alias-bg-primary, transparent)',
      color: 'inherit',
    }
    const fieldStyle = { marginBottom: 14 }
    const buttonStyle = {
      padding: '5px 12px',
      fontSize: 12,
      borderRadius: 6,
      border: '1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.35))',
      background: 'var(--dsw-alias-bg-secondary, rgba(128,128,128,.12))',
      color: 'inherit',
      cursor: 'pointer',
    }

    function Field({ label, hint, children }) {
      const id = React.useId()
      const direct = React.isValidElement(children) && ['input', 'textarea', 'select'].includes(children.type)
      return React.createElement('div', { style: fieldStyle },
        React.createElement(direct ? 'label' : 'div', { style: labelStyle, ...(direct ? { htmlFor: id } : {}) }, label),
        direct ? React.cloneElement(children, { id, 'aria-describedby': hint ? `${id}-hint` : undefined }) : children,
        hint === undefined ? null : React.createElement('div', { id: `${id}-hint`, style: hintStyle }, hint))
    }

    function TaggedScript({ text }) {
      return React.createElement('div', { className: 'drama3-tts-tagged-script' },
        String(text ?? '').split(/(\[[^\]\n]{1,120}\]|<\/?(?:emphasis|whisper|soft|fast|slow|stress|forceful)>)/gi)
          .filter(Boolean).map((part, i) => /^[\[<]/.test(part)
            ? React.createElement('mark', { key: i }, part)
            : React.createElement(React.Fragment, { key: i }, part)))
    }

    function SynthesisBadge({ plan, t }) {
      if (!['whole-reply', 'segmented'].includes(plan.synthesisMode)) return null
      const label = t(`preview.mode.${plan.synthesisMode}`)
      const reasonKey = `preview.segmentation.${plan.segmentationReason}`
      const reason = t(reasonKey)
      return React.createElement('span', { className: 'drama3-tts-badge drama3-tts-mode',
        title: plan.segmentationReason && reason !== reasonKey ? reason : t(`preview.mode.${plan.synthesisMode}`),
      }, label)
    }

    function ProsodyPlan({ plan, t }) {
      const sentences = (Array.isArray(plan.prosody) ? plan.prosody : [])
        .filter((sentence) => sentence && typeof sentence.text === 'string' && sentence.text.trim())
      if (sentences.length === 0) return null
      const intents = new Set(['explain', 'contrast', 'caution', 'next-step', 'closing'])
      return React.createElement('details', { className: 'drama3-tts-prosody' },
        React.createElement('summary', null, t('preview.prosody')),
        plan.prosodyStatus === 'fallback' ? React.createElement('div', { className: 'drama3-tts-prosody-note' }, t('preview.prosody.fallback')) : null,
        React.createElement('ol', null, sentences.map((sentence, index) => React.createElement('li', { key: index },
          React.createElement('p', null, sentence.text),
          React.createElement('div', { className: 'drama3-tts-prosody-cues' },
            intents.has(sentence.intent) ? React.createElement('span', { className: 'drama3-tts-badge' }, t(`preview.prosody.${sentence.intent}`)) : null,
            typeof sentence.emphasis === 'string' && sentence.emphasis ? React.createElement('span', null, t('preview.prosody.emphasis').replace('{text}', sentence.emphasis)) : null,
            sentence.pauseAfter === 'short' ? React.createElement('span', null, t('preview.prosody.short')) : null,
            sentence.pace === 'slower' ? React.createElement('span', null, t('preview.prosody.slower')) : null,
            typeof sentence.delivery === 'string' && sentence.delivery ? React.createElement('span', null, t('preview.prosody.delivery').replace('{text}', sentence.delivery)) : null)))))
    }

    function PlanNotes({ plan, t, compact = false }) {
      const notes = (Array.isArray(plan.warnings) ? plan.warnings : []).map((warning) => warningLabel(t, warning, plan))
      const omitted = Number.isFinite(plan.omittedCode) ? Math.max(0, Math.floor(plan.omittedCode)) : 0
      if (omitted > 0) notes.push(t('preview.omittedCode').replace('{count}', omitted))
      if (notes.length === 0) return null
      return React.createElement('div', { className: compact ? 'drama3-tts-player-notes' : 'drama3-tts-warning', role: 'status' },
        notes.map((note, i) => React.createElement('div', { key: i }, note)))
    }

    function ScriptDetails({ plan, t }) {
      const changes = (Array.isArray(plan.pronunciationChanges) ? plan.pronunciationChanges : [])
        .filter((entry) => entry && typeof entry.term === 'string' && typeof entry.reading === 'string')
      const original = typeof plan.originalText === 'string' ? plan.originalText : plan.cleanedText
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'drama3-tts-script-label' }, t('preview.directedScript')),
        React.createElement(TaggedScript, { text: plan.script ?? plan.scripted ?? plan.spokenText }),
        React.createElement(ProsodyPlan, { plan, t }),
        changes.length ? React.createElement('section', { className: 'drama3-tts-pronunciations', 'aria-label': t('preview.pronunciations') },
          React.createElement('div', { className: 'drama3-tts-section-title' }, t('preview.pronunciations')),
          React.createElement('div', { style: hintStyle }, t('preview.pronunciationHint')),
          React.createElement('dl', null, changes.map((entry, i) => {
            const reading = entry.kind === 'phoneme'
              ? t('preview.phoneme').replace('{reading}', /^\/.*\/$/.test(entry.reading) ? entry.reading : `/${entry.reading}/`)
              : entry.reading
            return React.createElement('div', { key: `${entry.term}-${i}` },
              React.createElement('dt', null, entry.term),
              React.createElement('dd', null, reading))
          }))) : null,
        original ? React.createElement('details', null,
          React.createElement('summary', null, t(typeof plan.originalText === 'string' ? 'preview.originalText' : 'preview.cleanedText')),
          React.createElement('div', { className: 'drama3-tts-comparison' }, original)) : null,
        plan.synthesisText ? React.createElement('details', { className: 'drama3-tts-synthesis-details' },
          React.createElement('summary', null, t('preview.synthesisText')),
          React.createElement('div', { style: hintStyle }, t('preview.synthesisHint')),
          React.createElement('pre', { className: 'drama3-tts-comparison' }, plan.synthesisText)) : null)
    }

    function ScriptPreview({ plan, t }) {
      if (!plan) return null
      return React.createElement('section', { className: 'drama3-tts-preview', 'aria-label': t('player.script') },
        React.createElement('div', { className: 'drama3-tts-section-title' }, t('player.script'),
          React.createElement('span', { className: 'drama3-tts-badge' }, t(plan.summarized ? 'player.summary' : 'player.original')),
          React.createElement(SynthesisBadge, { plan, t })),
        React.createElement(PlanNotes, { plan, t }),
        React.createElement(ScriptDetails, { plan, t }))
    }

    function Settings(props) {
      const { t, engine, player } = props
      const [config, setConfig] = React.useState(null)
      const [apiKey, setApiKey] = React.useState('')
      const [tagApiKey, setTagApiKey] = React.useState('')
      const [status, setStatus] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [failure, setFailure] = React.useState('')
      const [dirty, setDirty] = React.useState(false)
      const [reload, setReload] = React.useState(0)
      const [voices, setVoices] = React.useState([])
      const [sample, setSample] = React.useState(() => (document.documentElement?.lang ?? 'zh').startsWith('zh') ? SAMPLE_ZH : SAMPLE_EN)
      const [sampleContext, setSampleContext] = React.useState('')
      const [previewPlan, setPreviewPlan] = React.useState(null)
      const snapshot = React.useSyncExternalStore(player.subscribe, player.get, player.get)
      const testing = ['speaking', 'planning', 'buffering'].includes(snapshot.status)
      React.useEffect(() => () => {
        if (player.get().messageId === 'drama3-tts:preview') player.stop()
      }, [player])
      React.useEffect(() => {
        let alive = true
        setFailure('')
        getJson('/config').then((body) => { if (alive) setConfig(withSettingsDefaults(body.config)) })
          .catch(() => { if (alive) setFailure(t('settings.loadFailed')) })
        getJson('/voices').then((body) => { if (alive) setVoices(body.voices ?? []) }).catch(() => {})
        return () => { alive = false }
      }, [reload])
      if (config === null) return React.createElement('div', { role: failure ? 'alert' : 'status' },
        failure || t('settings.status.checking'), failure ? React.createElement('button', {
          type: 'button', style: buttonStyle, onClick: () => setReload(reload + 1),
        }, t('settings.retryLoad')) : null)

      const local = config.provider !== 'fish'
      const edit = (patch) => { setConfig((current) => ({ ...current, ...patch })); setDirty(true); setNotice(''); setFailure(''); setPreviewPlan(null) }
      const context = sampleContext.trim() ? [{ role: 'user', content: sampleContext.trim().slice(0, 1000) }] : []
      const save = async () => {
        setBusy('save'); setFailure(''); setNotice(''); player.stop()
        try {
          const patch = { ...config }
          if (apiKey === null || apiKey !== '') patch.apiKey = apiKey
          if (tagApiKey === null || tagApiKey !== '') patch.tagApiKey = tagApiKey
          const body = await postJson('/config', { patch })
          setConfig(withSettingsDefaults(body.config)); setApiKey(''); setTagApiKey(''); setDirty(false); setNotice(t('settings.saved'))
          return body.config
        } catch (error) {
          setFailure(errorLabel(t, error?.code)); throw error
        } finally { setBusy('') }
      }
      const readiness = local
        ? [!config.refAudioPath?.trim() && t('settings.refAudio'), !config.refText?.trim() && t('settings.referenceTextRequired')].filter(Boolean)
        : [!config.voiceId?.trim() && t('settings.voiceRequired'), !(apiKey || (apiKey !== null && config.hasApiKey)) && t('settings.apiKey')].filter(Boolean)
      const prepare = async () => {
        try {
          await save(); setBusy('plan'); setNotice('')
          const plan = await postJson('/plan', { text: sample, context })
          setPreviewPlan({ ...plan, originalText: sample })
        } catch (error) { setFailure(errorLabel(t, error?.code)) }
        finally { setBusy('') }
      }
      const preview = async () => {
        if (testing) { player.stop(); return }
        engine.unlock()
        if (readiness.length) { setFailure(`${t('settings.readiness')} ${readiness.join('、')}`); return }
        try {
          const prepared = dirty ? null : previewPlan
          await save(); await player.speak('drama3-tts:preview', sample, context, prepared)
        }
        catch (error) { setFailure(errorLabel(t, error?.code)) }
      }
      const check = async () => {
        try { await save(); setBusy('status'); setStatus(await getJson('/status')) }
        catch (error) { setFailure(errorLabel(t, error?.code)) }
        finally { setBusy('') }
      }
      const upload = async (file) => {
        if (!file) return
        setFailure(''); setNotice('')
        if (!file.size || file.size > 20 * 1024 * 1024) { setFailure(t('error.invalid-size')); return }
        if (!/\.(wav|mp3|m4a|flac|ogg)$/i.test(file.name)) { setFailure(t('error.unsupported-format')); return }
        setBusy('upload')
        try {
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result ?? ''))
            reader.onerror = () => reject(new Error('read-failed'))
            reader.readAsDataURL(file)
          })
          const body = await postJson('/voices', { name: file.name, data })
          edit({ refAudioPath: body.path }); setNotice(t('settings.uploaded'))
          const list = await getJson('/voices').catch(() => null)
          if (list) setVoices(list.voices ?? [])
        } catch (error) { setFailure(errorLabel(t, error?.code ?? 'failed')) }
        finally { setBusy('') }
      }
      const changeProvider = (provider) => {
        if (provider === config.provider) return
        setApiKey(null)
        edit({ provider, ...(config.defaults?.[provider] ?? {}), ...(provider === 'fish' ? { voiceId: FISH_JIALAN_PRESET.voiceId, model: FISH_JIALAN_PRESET.model } : {}) })
        setStatus(null)
      }
      const preset = () => {
        if (config.provider !== 'fish') setApiKey(null)
        edit(FISH_JIALAN_PRESET)
        setNotice(t('settings.preset.applied')); setStatus(null)
      }
      const input = (key, label, hint, extra = {}) => React.createElement(Field, { label: t(label), hint: hint ? t(hint) : undefined },
        React.createElement('input', { style: inputStyle, value: config[key] ?? '', spellCheck: false,
          onChange: (event) => edit({ [key]: event.target.value }), ...extra }))
      const toggle = (key, label, hint) => React.createElement(Field, { label: t(label), hint: t(hint) },
        React.createElement('label', { className: 'drama3-tts-switch' },
          React.createElement('input', { type: 'checkbox', checked: config[key] === true, 'aria-label': t(label), onChange: (event) => edit({ [key]: event.target.checked }) }),
          t(config[key] ? 'settings.on' : 'settings.off')))
      const range = (key, label, hint, min, max, step) => React.createElement(Field, { label: t(label), hint: t(hint) },
        React.createElement('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
          React.createElement('input', { type: 'range', min, max, step, value: config[key] ?? min, style: { flex: 1 },
            'aria-label': t(label), onChange: (event) => edit({ [key]: Number(event.target.value) }) }),
          React.createElement('output', { style: { minWidth: 44, textAlign: 'right' } }, key === 'speed' ? `${Number(config[key] ?? 1).toFixed(2)}×` : config[key])))
      const secret = (label, value, setter, hasKey) => React.createElement(Field, { label: t(label), hint: hasKey && value !== null ? t('settings.apiKey.saved') : undefined },
        React.createElement('div', { style: { display: 'flex', gap: 8 } },
          React.createElement('input', { type: 'password', autoComplete: 'new-password', style: inputStyle,
            'aria-label': t(label), value: value ?? '', placeholder: hasKey && value !== null ? '••••••••' : t('settings.apiKey.placeholder'),
            onChange: (event) => { setter(event.target.value); setDirty(true) } }),
          hasKey && value !== null ? React.createElement('button', { type: 'button', style: buttonStyle,
            onClick: () => { setter(null); setDirty(true); setNotice(t('settings.clearKey')) } }, t('settings.apiKey.clear')) : null))
      const prepared = previewPlan ?? (snapshot.script ? snapshot : null)
      return React.createElement('div', { className: 'drama3-tts-settings' },
        React.createElement('div', { className: 'drama3-tts-heading' }, t('settings.title')),
        React.createElement('div', { className: 'drama3-tts-flow' }, t('settings.flow')),
        React.createElement('fieldset', { disabled: busy !== '', style: { border: 0, padding: 0, margin: 0, minWidth: 0 } },
          React.createElement('section', { className: 'drama3-tts-section' },
            React.createElement('h3', { className: 'drama3-tts-section-title' }, t('settings.voice')),
            React.createElement(Field, { label: t('settings.provider') }, React.createElement('select', { style: inputStyle, value: config.provider,
              onChange: (event) => changeProvider(event.target.value) },
              React.createElement('option', { value: 'local' }, t('settings.provider.local')),
              React.createElement('option', { value: 'fish' }, t('settings.provider.fish')))),
            !local ? React.createElement(React.Fragment, null,
              React.createElement('button', { type: 'button', style: buttonStyle, onClick: preset }, t('settings.preset')),
              React.createElement('p', { style: hintStyle }, t('settings.preset.hint'))) : null,
            local ? React.createElement(React.Fragment, null,
              React.createElement('p', { className: 'drama3-tts-info' }, t('settings.local.hint')),
              input('refAudioPath', 'settings.refAudio', 'settings.refAudio.placeholder'),
              voices.length ? React.createElement(Field, { label: t('settings.refAudio.saved') },
                React.createElement('select', { style: inputStyle, value: voices.some((voice) => voice.path === config.refAudioPath) ? config.refAudioPath : '',
                  onChange: (event) => { if (event.target.value) edit({ refAudioPath: event.target.value }) } },
                  React.createElement('option', { value: '' }, t('settings.refAudio.none')),
                  voices.map((voice) => React.createElement('option', { key: voice.path, value: voice.path }, voice.name)))) : null,
              React.createElement(Field, { label: t('settings.refAudio.upload'), hint: t('settings.uploadFormats') },
                React.createElement('input', { type: 'file', accept: '.wav,.mp3,.m4a,.flac,.ogg', style: { maxWidth: '100%' },
                  onChange: (event) => { upload(event.target.files?.[0]); event.target.value = '' } })),
              React.createElement(Field, { label: t('settings.refText'), hint: t('settings.refText.placeholder') },
                React.createElement('textarea', { style: { ...inputStyle, minHeight: 80, resize: 'vertical' }, value: config.refText,
                  onChange: (event) => edit({ refText: event.target.value }) })))
              : input('voiceId', 'settings.voiceId', 'settings.voiceId.hint'),
            secret('settings.apiKey', apiKey, setApiKey, config.hasApiKey),
            range('speed', 'settings.speed', 'settings.speed.hint', 0.75, 1.6, 0.05)),
          React.createElement('section', { className: 'drama3-tts-section' },
            React.createElement('h3', { className: 'drama3-tts-section-title' }, t('settings.script')),
            toggle('summaryEnabled', 'settings.summaryEnabled', 'settings.summaryEnabled.hint'),
            config.summaryEnabled ? range('summaryMaxChars', 'settings.summaryMaxChars', 'settings.summaryMaxChars.hint', 80, 800, 20) : null,
            toggle('tagEnabled', 'settings.tagEnabled', 'settings.tagEnabled.hint'),
            toggle('pronunciationEnabled', 'settings.pronunciationEnabled', 'settings.pronunciationEnabled.hint'),
            local ? toggle('speechCheckEnabled', 'settings.speechCheckEnabled', 'settings.speechCheckEnabled.hint') : null,
            toggle('wholeReplyEnabled', 'settings.wholeReplyEnabled', 'settings.wholeReplyEnabled.hint')),
          React.createElement('details', { className: 'drama3-tts-section' },
            React.createElement('summary', { className: 'drama3-tts-section-title' }, t('settings.advanced')),
            React.createElement('div', { style: { marginTop: 16 } },
              input('baseUrl', 'settings.baseUrl', local ? 'settings.baseUrl.hint.local' : 'settings.baseUrl.hint.fish'),
              input('model', 'settings.model', local ? 'settings.model.hint.local' : 'settings.model.hint.fish'),
              local && config.speechCheckEnabled ? React.createElement(React.Fragment, null,
                input('speechCheckBaseUrl', 'settings.speechCheckBaseUrl', 'settings.speechCheckBaseUrl.hint'),
                input('speechCheckModel', 'settings.speechCheckModel')) : null,
              config.summaryEnabled || config.tagEnabled ? React.createElement(React.Fragment, null,
                input('tagBaseUrl', 'settings.tagBaseUrl'), input('tagModel', 'settings.tagModel', 'settings.tagModel.hint'),
                secret('settings.tagApiKey', tagApiKey, setTagApiKey, config.hasTagApiKey)) : null,
              config.pronunciationEnabled ? React.createElement(Field, { label: t('settings.pronunciationLexicon'), hint: t('settings.pronunciationLexicon.hint') },
                React.createElement('textarea', { style: { ...inputStyle, minHeight: 88, resize: 'vertical' },
                  value: config.pronunciationLexicon ?? '', spellCheck: false, placeholder: t('settings.pronunciationLexicon.placeholder'),
                  onChange: (event) => edit({ pronunciationLexicon: event.target.value }) })) : null,
              config.tagEnabled ? range('tagMax', 'settings.tagMax', 'settings.tagEnabled.hint', 1, 6, 1) : null,
              React.createElement(Field, { label: t('settings.tagMode'), hint: t('settings.tagMode.hint') },
                React.createElement('select', { style: inputStyle, value: config.tagMode, onChange: (event) => edit({ tagMode: event.target.value }) },
                  React.createElement('option', { value: 'strip' }, t('settings.tagMode.strip')),
                  React.createElement('option', { value: 'keep' }, t('settings.tagMode.keep')))),
              range('maxChars', 'settings.maxChars', 'settings.maxChars.hint', 60, 600, 20),
              React.createElement(Field, { label: t('settings.format') }, React.createElement('select', { style: inputStyle, value: config.format,
                onChange: (event) => edit({ format: event.target.value }) },
                React.createElement('option', { value: 'mp3' }, 'MP3'), React.createElement('option', { value: 'wav' }, 'WAV'))))),
          React.createElement('section', { className: 'drama3-tts-section' },
            React.createElement('h3', { className: 'drama3-tts-section-title' }, t('settings.test')),
            React.createElement(Field, { label: t('settings.previewText'), hint: t(local ? 'settings.preview.hint.local' : 'settings.preview.hint') },
              React.createElement('textarea', { style: { ...inputStyle, minHeight: 110, resize: 'vertical' }, value: sample,
                onChange: (event) => { setSample(event.target.value); setPreviewPlan(null) } })),
            React.createElement(Field, { label: t('settings.previewContext'), hint: t('settings.previewContext.hint') },
              React.createElement('textarea', { style: { ...inputStyle, minHeight: 58, resize: 'vertical' }, value: sampleContext,
                maxLength: 1000, placeholder: t('settings.previewContext.placeholder'), onChange: (event) => { setSampleContext(event.target.value); setPreviewPlan(null) } })),
            readiness.length ? React.createElement('div', { className: 'drama3-tts-info' }, `${t('settings.readiness')} ${readiness.join('、')}`) : null,
            React.createElement('div', { className: 'drama3-tts-actions' },
              React.createElement('button', { type: 'button', style: buttonStyle, disabled: !sample.trim(), onClick: prepare }, t(config.summaryEnabled ? config.tagEnabled ? 'settings.prepare' : 'settings.condense' : config.tagEnabled ? 'settings.autoTag' : 'settings.preparePlain')),
              React.createElement('button', { type: 'button', style: buttonStyle, disabled: !sample.trim(), onClick: preview }, testing ? t('settings.stop') : t('settings.previewAction'))))),
        React.createElement('div', { className: 'drama3-tts-savebar' },
          React.createElement('button', { type: 'button', style: buttonStyle, disabled: busy !== '', onClick: () => save().catch(() => {}) }, busy === 'save' ? t('settings.saving') : t('settings.save')),
          React.createElement('button', { type: 'button', style: buttonStyle, disabled: busy !== '', onClick: check }, busy === 'status' ? t('settings.status.checking') : t('settings.checkAction')),
          React.createElement('span', { role: 'status' }, busy === 'plan' ? t('player.preparing') : busy === 'upload' ? t('settings.refAudio.uploading') : dirty ? t('settings.dirty') : notice)),
        failure ? React.createElement('div', { className: 'drama3-tts-warning', role: 'alert' }, failure) : null,
        status ? React.createElement('div', { className: 'drama3-tts-info', role: 'status' },
          `${t('settings.status')}: ${t(status.health ? 'settings.status.ok' : 'settings.status.down')}`,
          status.models?.length ? ` · ${t('settings.status.models')}: ${status.models.join(', ')}` : '') : null,
        React.createElement(PlaybackBar, { player, t, surface: 'preview' }),
        React.createElement(ScriptPreview, { plan: prepared, t }))
    }

    /* ---------------------------------------------------------------- apply */

    return {
      name: NS,
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'drama3-tts: dictionaries')

        const listeners = new Set()
        let autoRead = readAutoRead(window)
        const subscribeAutoRead = (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        }
        const setAutoRead = (value) => {
          autoRead = value
          writeAutoRead(window, value)
          for (const listener of listeners) listener()
        }

        const STYLE_ID = 'dsh-drama3-tts-style'
        if (document.getElementById(STYLE_ID) === null) {
          const style = document.createElement('style')
          style.id = STYLE_ID
          style.textContent = `
            @keyframes drama3-tts-wave{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}
            .drama3-tts-bars{display:inline-flex;align-items:flex-end;gap:2px;height:13px}
            .drama3-tts-bars i{display:block;width:2px;height:13px;border-radius:1px;background:currentColor;transform-origin:center bottom;animation:drama3-tts-wave .9s ease-in-out infinite}
            .drama3-tts-bars i:nth-child(2){animation-delay:.12s}.drama3-tts-bars i:nth-child(3){animation-delay:.24s}.drama3-tts-bars i:nth-child(4){animation-delay:.36s}
            .drama3-tts-player{--tts-muted:var(--dsw-alias-label-tertiary,#a7adb7);--tts-border:var(--dsw-alias-border-secondary,rgba(128,128,128,.2));position:relative;box-sizing:border-box;width:100%;max-width:660px;min-width:0;margin:0 auto 8px;padding:10px 12px;border-radius:12px;background:var(--dsw-alias-bg-secondary,#1c1d21);color:var(--dsw-alias-label-primary,#edf0f4);border:1px solid var(--tts-border);font-size:12px;max-height:min(320px,45dvh);overflow:auto;overscroll-behavior:contain;container-type:inline-size}
            .drama3-tts-player-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}
            .drama3-tts-player-play{width:32px;height:32px;border-radius:50%;border:none;background:rgba(127,178,255,.14);color:var(--dsw-alias-state-business-primary,#9fc4ff);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto}
            .drama3-tts-player-play:hover{background:rgba(127,178,255,.24)}
            .drama3-tts-player-alert{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:var(--dsh-color-warning,#d3af72);background:rgba(201,140,49,.1);flex:0 0 auto}
            @keyframes drama3-tts-spin{to{transform:rotate(360deg)}}
            .drama3-tts-player-loading{box-sizing:border-box;width:18px;height:18px;margin:7px;border:2px solid rgba(127,178,255,.2);border-top-color:var(--dsw-alias-state-business-primary,#9fc4ff);border-radius:50%;animation:drama3-tts-spin 1s linear infinite;flex:0 0 auto}
            .drama3-tts-player button:disabled{opacity:.45;cursor:wait}
            .drama3-tts-player-wave{display:flex;align-items:center;gap:2px;height:28px;cursor:pointer;flex:1 1 auto;min-width:0;overflow:hidden}
            .drama3-tts-player-wave i{display:block;min-width:1px;flex:1 1 3px;border-radius:1.5px;background:#7fb2ff;transition:opacity .12s linear}
            .drama3-tts-player-status{flex:1;min-width:0;line-height:1.5;overflow-wrap:anywhere}
            .drama3-tts-player-status strong{display:block;font-size:12px;font-weight:600}
            .drama3-tts-player-reason{display:block;color:var(--tts-muted);font-size:11px;margin-top:2px}
            .drama3-tts-player-time{font-variant-numeric:tabular-nums;color:var(--tts-muted);white-space:nowrap}
            .drama3-tts-player-seg{color:var(--tts-muted);white-space:nowrap;font-size:11px}
            .drama3-tts-player-icon{width:28px;height:28px;border-radius:7px;border:none;background:transparent;color:var(--tts-muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto}
            .drama3-tts-player-tags,.drama3-tts-player-retry{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:28px;cursor:pointer;padding:4px 7px;border-radius:7px;background:transparent;color:var(--tts-muted);white-space:nowrap;border:1px solid transparent;font:inherit;flex:0 0 auto}
            .drama3-tts-player-retry{border-color:var(--tts-border);color:inherit;padding-inline:9px}
            .drama3-tts-player-icon:hover,.drama3-tts-player-tags:hover,.drama3-tts-player-retry:hover{background:rgba(128,128,128,.12);color:inherit}
            .drama3-tts-player-tags[aria-expanded=true]{background:rgba(128,128,128,.1);color:inherit}
            .drama3-tts-player-tags[aria-expanded=true] svg{transform:rotate(180deg)}
            .drama3-tts-script{max-height:min(160px,25dvh);overflow:auto;overscroll-behavior:contain;margin-top:10px;border-top:1px solid var(--tts-border);padding-top:10px;line-height:1.7;overflow-wrap:anywhere}
            .drama3-tts-spoken-text{white-space:pre-wrap;line-height:1.85}
            .drama3-tts-script-label{color:var(--tts-muted);font-size:11px;margin-bottom:5px}
            .drama3-tts-player-notes{padding-top:8px;color:var(--dsh-color-warning,#d3af72);line-height:1.5;font-size:11px}
            .drama3-tts-downloads{margin-top:8px;font-size:11px;color:var(--tts-muted)}
            .drama3-tts-downloads summary{cursor:pointer}.drama3-tts-downloads>div{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
            .drama3-tts-downloads a{color:var(--dsw-alias-state-business-primary,#9fc4ff);padding:3px 6px}
            .drama3-tts-hint{position:fixed;z-index:2147483000;transform:translate(-50%,-100%);background:rgba(28,31,38,.95);color:#f5f7fa;font-size:12px;line-height:1.4;padding:4px 8px;border-radius:6px;white-space:nowrap;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.35)}
            .drama3-tts-settings{font-size:13px;max-width:680px;line-height:1.55}
            .drama3-tts-heading{font-size:20px;font-weight:700;letter-spacing:-.02em}
            .drama3-tts-flow{margin:8px 0 20px;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-secondary,rgba(128,128,128,.1));font-size:12px}
            .drama3-tts-section{margin-bottom:16px;padding:18px;border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.22));border-radius:12px}
            .drama3-tts-section-title{font-size:14px;font-weight:650;margin:0 0 14px;display:flex;align-items:center;gap:8px}
            details.drama3-tts-section>summary{display:list-item;cursor:pointer;margin:0}
            .drama3-tts-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer}.drama3-tts-switch input{width:16px;height:16px;accent-color:var(--dsw-alias-state-business-primary,#4d93f8)}
            .drama3-tts-info{font-size:12px;padding:10px 12px;margin:10px 0;border-radius:8px;background:var(--dsw-alias-bg-secondary,rgba(128,128,128,.08));overflow-wrap:anywhere}
            .drama3-tts-warning{font-size:12px;padding:10px 12px;margin:10px 0;border-left:3px solid var(--dsh-color-warning,#c98c31);background:rgba(201,140,49,.09);line-height:1.6;overflow-wrap:anywhere}
            .drama3-tts-actions,.drama3-tts-savebar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.drama3-tts-savebar{margin:14px 0}
            .drama3-tts-savebar span{font-size:12px;opacity:.75}
            .drama3-tts-preview{padding:18px;margin-top:16px;border-radius:12px;background:var(--dsw-alias-bg-secondary,rgba(128,128,128,.08))}
            .drama3-tts-preview details{font-size:12px;margin-top:12px}.drama3-tts-preview summary{cursor:pointer}
            .drama3-tts-mode{white-space:nowrap;flex:0 0 auto}.drama3-tts-preview>.drama3-tts-section-title{flex-wrap:wrap}
            .drama3-tts-prosody{margin-top:12px}.drama3-tts-prosody summary{cursor:pointer}.drama3-tts-prosody ol{padding-left:20px;margin:10px 0 0}
            .drama3-tts-prosody li{padding:3px 0 9px}.drama3-tts-prosody p{margin:0 0 6px;overflow-wrap:anywhere}
            .drama3-tts-prosody-cues{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;font-size:11px;opacity:.85}
            .drama3-tts-prosody-note{font-size:12px;opacity:.72;margin-top:8px}
            .drama3-tts-pronunciations{margin-top:16px}.drama3-tts-pronunciations .drama3-tts-section-title{margin-bottom:4px}
            .drama3-tts-pronunciations dl{margin:8px 0}.drama3-tts-pronunciations dl>div{display:grid;grid-template-columns:minmax(80px,1fr) minmax(0,2fr);gap:12px;padding:5px 0;border-bottom:1px solid rgba(128,128,128,.16)}
            .drama3-tts-pronunciations dt{font-weight:600;overflow-wrap:anywhere}.drama3-tts-pronunciations dd{margin:0;overflow-wrap:anywhere}
            .drama3-tts-comparison{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;font:inherit;margin:8px 0 0}
            .drama3-tts-script details{margin-top:12px}.drama3-tts-script summary{cursor:pointer;color:var(--tts-muted)}
            .drama3-tts-badge{font-size:11px;font-weight:400;padding:2px 7px;border-radius:12px;border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.22))}
            .drama3-tts-tagged-script{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9}
            .drama3-tts-tagged-script mark{font:inherit;color:var(--dsw-alias-state-business-primary,#4d93f8);background:rgba(127,178,255,.12);padding:2px 5px;border-radius:5px;border:1px solid rgba(127,178,255,.2);box-decoration-break:clone;-webkit-box-decoration-break:clone}
            .drama3-tts-settings button:disabled{opacity:.5;cursor:wait}
            .drama3-tts-settings :focus-visible,.drama3-tts-player :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d93f8);outline-offset:3px}
            @container(max-width:420px){.drama3-tts-player-row{gap:6px}.drama3-tts-player-wave{order:10;flex-basis:100%}.drama3-tts-player-seg,.drama3-tts-player-time{font-size:10px}}
            @media(max-width:480px){.drama3-tts-player{padding:10px}.drama3-tts-section{padding:13px}.drama3-tts-flow{font-size:11px}}
            @media(prefers-reduced-motion:reduce){.drama3-tts-bars i{animation:none;transform:scaleY(.6)}.drama3-tts-player-loading{animation:none}}
          `
          document.head.appendChild(style)
          ctx.effect(() => () => style.remove(), 'drama3-tts: styles')
        }
        const playback = () => ({ rate: 1, volume: 0.85 })
        const engine = createAudioEngine(playback)
        const player = createPlayer(engine)
        // Browsers only grant playback after a gesture: unlock on the first
        // interaction so auto-read works without pressing a button first.
        const unlockOnce = () => engine.unlock()
        window.addEventListener('pointerdown', unlockOnce, { once: true, passive: true })
        ctx.effect(() => () => window.removeEventListener('pointerdown', unlockOnce), 'drama3-tts: audio unlock')
        const loadTime = Date.now()
        const played = new Set()
        const watermarks = new Map()

        ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
          name: 'conversation.chat.assistant-actions',
          id: NS,
          order: 25,
          locale: NS,
          inject: () => ({ player, unlock: engine.unlock, autoRead: () => autoRead, loadTime, played, watermarks }),
        }, Actions))

        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: NS,
          order: 40,
          locale: NS,
          inject: () => ({ player }),
        }, PlaybackBar))

        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: NS,
          order: 30,
          locale: NS,
          inject: () => ({
            watermarks,
            read: () => autoRead,
            set: setAutoRead,
            subscribe: subscribeAutoRead,
            player,
            unlock: engine.unlock,
          }),
        }, ComposerToggle))

        let disposeSection = null
        const mountSection = () => {
          if (disposeSection !== null) {
            disposeSection()
            disposeSection = null
          }
          const t = ctx.locale.bind(NS)
          disposeSection = ctx.slots.register({
            name: 'settings.section',
            id: NS,
            order: 50,
            locale: NS,
            label: () => t('settings.label'),
            inject: () => ({ engine, player }),
          }, Settings)
        }
        ctx.slots.inject('settings.section', () => {
          mountSection()
          const onLocale = ctx.on('locale/change', () => mountSection())
          return () => {
            onLocale()
            if (disposeSection !== null) {
              disposeSection()
              disposeSection = null
            }
            player.stop()
          }
        })
      },
    }
  },
})
