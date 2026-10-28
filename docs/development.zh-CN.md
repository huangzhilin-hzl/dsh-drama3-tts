# 开发与 API

[English](development.md) | **简体中文**

[返回中文 README](../README.zh-CN.md) · [配置说明](configuration.zh-CN.md)

## 模块边界

| 文件 | 职责 |
| --- | --- |
| `index.js` | Host 插件入口：配置、参考录音、模型调用、缓存与 HTTP 路由 |
| `lib/text.js` | 清洗正文、代码省略、上下文裁剪、分段和生成预算 |
| `lib/script-validation.js` | 导演标签、裸稿比较、音素输入与摘要数值/技术标识校验 |
| `pronunciation.js` | 内置读法、自定义词典校验和发音控制编译 |
| `prosody.js` | 句级计划对齐、规则回退、语气控制编译 |
| `speech-check.js` | 纯文本的中文句首锚点提取与转写匹配 |
| `client.js` | DSH lazy-module 前端：文案、设置、自动朗读、Web Audio 播放器及 UI |
| `cordis.patch.yml` | Host 插件注册 |
| `locale/*.json` | 插件列表的元信息；具体界面文案在 `client.js` |
| `tests/` | Host、React 组件、文本规则及可选真实合成测试 |
| `examples/reference-audio/` | 教程配套的参考音频与逐字稿，随插件分发 |
| `examples/demo/` | 从回复旁朗读按钮开始、到播放器自动收起的聊天界面录屏，及界面预览和当次播放音频 |

`client.js` 通过 `window.__ModuleLoader__.load()` 注册工厂，工厂内使用宿主提供的 `require()`。它不是直接执行的浏览器 ES module；拆文件或调整加载方式前，需验证 DSH 的实际模块加载契约。

## 处理流程

```mermaid
flowchart LR
    A[回复与有限上下文] --> B[清洗正文和省略长代码]
    B --> C[可选精简与句级计划]
    C --> D[正文与标签校验]
    D --> E[术语发音编译]
    E --> F[整段或自然分段]
    F --> G{音频缓存命中?}
    G -->|是| I[播放与下载]
    G -->|否| H[新合成及可选中文句首检查]
    H --> J[成功后缓存音频]
    J --> I
```

图中的句首检查只对启用该功能、符合条件的新合成音频运行。已缓存音频直接返回；缓存键包含检查策略与配置，切换检查配置会使用不同缓存键。

精简与语气计划有最多 40 条进程内缓存。只有通过校验的正常计划会被记忆；失败摘要不会缓存。音频缓存预算为 256 MiB，超出时按最近使用时间清理；缓存键包括提供方、服务、模型、录音内容指纹、参考逐字稿、速度、格式、实际合成文本、生成预算与识别配置。修改 UI 文案不会自动重做音频。

浏览器在每段开始时创建新音源并从零秒播放。一次页面内只有一个播放器，下一段在当前段播放时预取。自动尝试记录按会话与消息区分，失败和手动停止也会保留记录，避免重新渲染触发从头重播；该记录不是跨浏览器的持久任务队列。

## 插件 HTTP 接口

Host 挂载前缀 `/drama3-tts`。JSON 接口返回 `ok`，错误响应通常包含 `{ok:false, error, detail?}`；音频成功响应直接返回字节。接口有本地/同源请求检查，没有独立 API Key 登录层，不应当成通用公开服务直接暴露。

| 方法 | 路径 | 请求及响应要点 |
| --- | --- | --- |
| GET | `/config` | `{ok, config}`；密钥仅以是否已配置的标志返回 |
| POST | `/config` | `{patch:{...}}`，验证并保存部分配置，返回有效配置 |
| GET | `/status` | 合成服务健康、模型列表和参考录音就绪情况；不检查文本或识别服务 |
| POST | `/plan` | `{text, context?}`，返回口播稿、分段与诊断信息，不生成音频 |
| POST | `/speech` | `{text}`；使用实际合成文本，返回 MP3/WAV 或缓存 |
| GET | `/voices` | `{ok, voices:[{name,path,bytes,mtime}]}` |
| POST | `/voices` | `{name,data}`；`data` 为 Base64 或数据 URL，返回保存路径及字节数 |
| GET | `/selftest.wav` | 双音提示音，用于单独验证浏览器输出链路 |

`context` 为 `{role:"user"|"assistant", content:string}` 数组，最多保留近期 6 条、每条 1000 字符、合计 4000 字符。`/plan` 清洗后的正文上限为 20000 字符；`/speech` 每段上限为 1200 字符。参数中不支持任意 TTS 采样选项覆盖；当前服务器只在句首检查重试时添加一个新随机种子。

本地规划示例，按实际 DSH 地址替换端口：

```sh
curl --noproxy '*' --fail-with-body \
  -H 'Content-Type: application/json' \
  -d '{"text":"先核对结论，再检查测试条件是否一致。"}' \
  http://127.0.0.1:3080/drama3-tts/plan
```

### `/plan` 关键字段

| 字段 | 含义 |
| --- | --- |
| `cleanedText` | 清洗后的输入；兼容别名为 `cleaned` |
| `spokenText` | 口播正文，保留术语原拼写 |
| `script` | 可读导演稿；兼容别名为 `scripted` |
| `synthesisText` | 发给语音模型的文本，可能包含音素控制 |
| `segments` | 可直接逐段提交给 `/speech` 的合成文本数组 |
| `summarized` / `summaryStatus` | 是否精简；状态为 `applied`、`unchanged`、`disabled` 或 `fallback` |
| `tagged` / `tagStatus` | 是否应用语气标签及相应状态 |
| `warnings` / `summaryRejection` | 降级提示及拒绝原因 `{reason,values?}` |
| `omittedCode` | 仍保留在原回复、未逐字朗读的代码/路径/命令数量 |
| `pronunciationChanges` | `{term,reading,kind}` 列表，`kind` 为 `alias` 或 `phoneme` |
| `synthesisMode` | `whole-reply` 或 `segmented` |
| `spokenUnits` | 正文的口播长度估算，不含控制标记开销 |
| `segmentationReason` | `null`、`long-reply`、`payload-limit` 或 `disabled` |
| `prosody` | 实际应用的句级计划：`text,intent,emphasis,pauseAfter,pace,delivery` |
| `prosodySource` / `prosodyStatus` | 计划来源 `model/rules/legacy/disabled` 与应用状态 |
| `prosodyError` | 可选诊断原因，UI 用自然断句提示呈现 |
| `cached` | 已命中音频缓存的分段数，不代表已完成音质检查 |

### 上游调用与超时

| 上游 | 请求方式 | 单次超时 |
| --- | --- | --- |
| 本地合成 | `POST /v1/audio/speech`，`ref_audio` 数据 URL、`ref_text`、生成预算等 | 180 秒 |
| Fish Audio | `POST /v1/tts`，`reference_id`、模型请求头等 | 180 秒 |
| 文本处理 | `POST /chat/completions`，纯文本 JSON 口播计划 | 20 秒；摘要最多两次请求 |
| 可选识别 | `POST /chat/completions`，实际音频和转写要求 | 30 秒；句首不匹配最多重合成一次 |
| 合成健康检查 | `/health` 与 `/v1/models`，或 Fish 音色查询 | 4 秒 |

用户取消会传到当前的规划、合成及识别请求。合成 HTTP 成功仅表示拿到了音频字节；除可选句首规则外，没有通用听感、循环或全文完整性判定。

## 验证

```sh
npm ci
npm run check
npm test
```

测试使用临时 `DSH_HOME` 和模拟上游，不改写个人配置。前端测试使用真实 React 组件及可控播放器；它们能验证状态与调用次数，不能代替真实设备上的听感检查。

真实服务测试显式开启：

```sh
DSH_TTS_LIVE=1 npm test
```

该用例访问本机 `18190`，使用 `tests/fixtures/ref_zh.wav`，验证合成成功及缓存复用；不会使用已保存的参考录音，也不会自动播放。服务不可达时该用例会跳过，跳过不代表真实合成已通过。

检查包内文件可使用 `npm pack --dry-run`。打包清单应包含所有运行时依赖、用户文档及 `examples/` 中的教程样例；`node_modules/`、个人配置、用户上传的参考录音和实验输出不随插件分发。修改 Host 模块后需重载插件，修改客户端后刷新 DSH 页面；只做静态检查不代表运行中的页面已加载新代码。
