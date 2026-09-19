# 运行与恢复

## 现有项目

优先使用已有 `knowledge-paper-template`。传入明确项目路径，不把用户机器上的路径写死到 Skill。预检不会修改数据或联网：

```sh
node /path/to/skill/scripts/workflow.mjs check --project /path/to/project --unit unit02 u2-21-presentation u2-22-mood
```

需要 Node.js 22+、npm、ffmpeg、ffprobe，以及与锁文件一致的依赖和 Remotion Chromium。原样式优先 PingFang SC、Arial；其他系统安装有许可的中文/IPA 字体并重新检查布局，不分发系统字体。

同一电脑不同工作目录可能解析到不同 Node 版本。预检若提示版本不符，检查实际 `process.execPath`，使用已安装的 Node 22+，不要绕过检查或擅自修改全局配置。

## 新电脑 / 新工程

```sh
node /path/to/skill/scripts/init-project.mjs /path/to/new-project
cd /path/to/new-project
npm ci
```

初始化只接受不存在的目标目录。不会覆盖老工程、安装依赖或调用付费接口。按 `assets/lesson.example.json` 写入审核后的源稿，准备插画和有授权的 `public/microcourse/assets/bgm.wav`。本仓库不附带音乐；缺素材应报告，不能擅自用随机下载音乐替代。首次浏览器下载或 npm 安装需要网络权限。

创建本地 `.env.local`，或设置 `KNOWLEDGE_TTS_ENV_FILE` 指向本地环境文件。随附运行模板也支持直接传环境变量：

- `DOUBAO_TTS_API_KEY`：私密，仅本地配置。
- `DOUBAO_TTS_RESOURCE_ID`、`DOUBAO_TTS_SPEAKER`。
- 可选 `DOUBAO_TTS_MODEL`、`DOUBAO_TTS_ENGLISH_SPEAKER`、`DOUBAO_TTS_ENGLISH_MODEL`。

不要询问用户在聊天里贴密钥。已有工程的语音脚本可能回退读取相邻 tang-paper-video 的环境文件；跨电脑时显式指定配置，不依赖该回退。供应商和音色不要静默更换。

## 明确期数，顺序执行

以下命令均在项目根目录执行；示例期号不是默认要制作的范围：

```sh
node scripts/run-microcourse-batch.mjs voice --unit=unit02 u2-21-presentation u2-22-mood
node scripts/run-microcourse-batch.mjs render --unit=unit02 u2-21-presentation u2-22-mood
node scripts/check-microcourse-audio.mjs u2-21-presentation u2-22-mood
```

可以先用 `stills` 替代 `render` 生成布局检查和九宫格，但这不算视频交付。每次检查退出码和对应 `*-build.log`；旧 wrapper 可能在一集失败后继续后面的集，最终按失败名单恢复，不认为整个批次成功。

只有一个渲染进程能使用同一项目。最稳妥的是整批语音完成后串行渲染；需要重叠时，已完成语音的集可以先渲染，不能渲染尚未产生运行时 JSON 的集。

生成路径：

- 音频缓存：`public/microcourse/audio/<slug>/`。
- 运行时：`public/microcourse/<slug>.json`。
- 成片/字幕/文案/QA：`out/grade7/semester1/<unit>/<slug>/`。
- 包含 `master.wav`、`script.json`、`metadata.json`、`storyboard.jpg`、`qa-report.json`、`audio-qa.json`。

任何源稿或图片变化都需重新构建时间线与成片。长语音超过 70 秒时缩短内容，不改语速凑时长。图片文件被替换也必须重渲染，JSON hash 并不能证明图片内容未变。

## 可移植快照与原工程

`assets/runtime/` 保留了已验证组件和管线，不含其他学科、每日单词、数字人等无关项目。快照做了以下可移植性修正：入口不再依赖 Unit1 的固定样例 JSON；密钥文件不回退其他项目；源稿在配音开始时固定读取并检查中途变化；批量命令强制显式 slug；补充音频 QA 来源哈希。不要为这些改动覆盖现有生产工程。

随附依赖版本为原工程的锁定版本，不自动升级。跨平台字体、浏览器和供应商可用性仍需在目标机器验收。是否具备网络/付费额度以当次环境为准。
