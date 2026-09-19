# 验收与交付

## 必须全部满足

1. 内容已审核，styleApproval 指向用户批准的样片或本次样片批准记录；没有批准时只能作为待确认样片交付。
2. 指定的每一期都有 MP4、SRT、发布文案、storyboard、qa-report、audio-qa。
3. 1080×1920 / 30 fps / H.264 / yuv420p / AAC 48 kHz；45–70 秒（封装允许额外 0.15 秒）。完整解码通过。
4. DOM 排版采样没有越界、重叠、字幕超过两行；视频每秒像素非空检查通过；人工查看九场景与有疑问的实际采样帧。
5. 每个 cue 有非静音音频，综合响度约 -16 LUFS（±0.5），true peak 不超过 -2 dBTP。检查只证明信号和响度，不等于人工听辨发音、口音与表达；遇同形异音词等风险抽听相应 cue。
6. 问题读完至少三秒才揭示答案；runtime、原稿和 qa sourceHash 一致，视频哈希与 qa 一致。最终文件复制前后哈希一致。

先验证，不复制：

```sh
node /path/to/skill/scripts/workflow.mjs verify --project /path/to/project --unit unit02 u2-21-presentation u2-22-mood
```

逐期查看 storyboard 后，交付到一个新的目录（拒绝覆盖）：

```sh
node /path/to/skill/scripts/workflow.mjs deliver --project /path/to/project --unit unit02 --output /path/to/delivery/EP21-EP22 --visual-reviewed u2-21-presentation u2-22-mood
```

`--visual-reviewed` 记录操作者已完成检查，不是自动视觉评分。不得为绕过失败而填写。工具在全部条目验证成功后才创建交付目录；输出 `EP21 presentation.mp4`、同名 SRT、逐期文案、`视频号发布文案汇总.md` 和 `交付检查.json`。文件系统中途失败可能留下未完成目录，保留并报告，不标记 COMPLETE，不删除不明文件。

原渲染器 `releaseStatus: pilot-awaiting-style-review` 是旧固定字段，不作为实际发布状态。只有教学内容、用户样式批准、技术检查和逐期视觉检查全部满足才写批次 COMPLETE；`published` 始终为 false，除非另有用户授权且确实完成发布。

已有成片的续做先 verify；缺少文案可补文案，不为了文案重做视频。失败逐项报告，不用通过的样例代替整批验收。无网络时可以完成文案、源稿和检查已有成片，不能声称新配音/视频已完成。
