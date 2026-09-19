# 教材词汇自动化视频 Skill

将教材词汇分期规划制作成 9:16 Remotion 视频，含中英配音、字幕、三秒小测和视频号文案。来自已经实际交付的 Unit 1 / Unit 2 词汇流程；不包含教材、密钥、成片或付费音频。

## 安装到 Codex

将本仓库复制到 `${CODEX_HOME:-$HOME/.codex}/skills/textbook-vocabulary-video`（不要覆盖已有同名 Skill），重新加载 Skill 后调用：

> 使用 $textbook-vocabulary-video，参照当前项目的 Unit 2 视频规划，继续生成 EP26–EP30，并整理发布文案。

已有 `knowledge-paper-template` 项目时直接复用。换电脑时随附最小运行模板可以初始化新项目，详见 [运行说明](references/runtime.md)。需要 Node.js 22+、npm、FFmpeg/ffprobe、Remotion 浏览器、可显示中文和 IPA 的字体，以及用户自行配置的豆包 TTS 凭据。使用 Remotion、TTS 和第三方素材前，自行确认适用许可及费用。

这不是无人审核的一键发布工具：教材内容审核、样片批准和逐期视觉检查仍然保留。不会自动发视频号、续做未指定期数或创建定时任务。

## 验证

```sh
node --test tests/workflow.test.mjs
node scripts/workflow.mjs check --project /path/to/project --unit unit02 u2-21-presentation
```

参见 [Skill 入口](SKILL.md)、[内容约定](references/content.md)、[交付门禁](references/acceptance.md)。

## 完整中文教程

- [中文使用教程](docs/中文使用教程.md)：安装配置、首条样片、批量制作、续做修改、交付与迁移。
- [中文 Skill 工作流教程](docs/中文SKILL工作流教程.md)：设计分层、源稿结构、配音时间线、渲染验收、测试和分发。

已验证：7 项自动测试通过；对 EP21–EP25 既有成片完成只读交付验证；在独立目录安装锁定依赖、通过 TypeScript 检查，并用 EP21 已有音频完成九场景、36 帧渲染检查。测试未重新调用付费配音接口，也不代表所有操作系统字体已经验收。
