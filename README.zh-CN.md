# harnessed

**让 LLM agent 的行为可以被证明。** 这是一个给 Claude Code 和 Codex 用的 skill，开发、调试、评测、上线带工具调用的 agent 时都用得上。内容来自一个线上 agent 的真实事故，以及 66 个逐一核对过的资料来源，发布前做过压力测试。

[English](README.md)

## 为什么做这个

打个比方：Claude 本来就是个不错的 agent 工程师，但它交付的是“代码能跑”，而不是“行为被验证过”。

我们先在不装这个 skill 的情况下跑了一轮基线测试。Claude 的判断其实已经很好：
- 会反对为了 20 页 PDF 就上 LangGraph + RAG + mem0；
- 把退款规则写进代码；
- 能识别提示注入；
- 先查清原因，再动提示词。

问题出在收尾。一次完整实现最后是 53 个测试全绿，但对模型本身的行为只留下一句“拿到 key 后跑一下、读读回复”。线上 agent 出事往往也是这样：harness 的测试全绿，真实 agent 却在漏处理、说做完了其实没做、出错时悄悄降级。

所以这个 skill 不教判断，只补缺的那一块：

> **模型负责提议，harness 负责拍板。** 必须成立的事情（钱、对外发送、不可逆写入、完整性、预算）都由代码强制执行。agent 的行为靠评测证明，而不是靠感觉。

## 包含什么

**四件从第一天起就同步维护的东西**
1. **设计卡**：一页纸，写清任务、工具的风险分级，以及每条必须成立的规则由哪段代码保证、由哪个评测用例覆盖。它最后就是你的验收清单。
2. **带调用记录的 harness**：包括工具白名单、参数校验、需要确认的待执行动作、幂等、调用次数/时长/token 预算、有限次的错误恢复、明确的结束状态。界面上只展示实际发生了什么，不展示模型自己怎么说。
3. **行为评测**：每个场景都用真实模型、在全新的模拟环境里跑多次，按实际结果判分。报告里有单次通过率和“连续 k 次全过”的比例，并附上提示词、工具和模型的版本指纹。
4. **完工标准**：没有在实际上线的模型和提示词上重新跑过评测，就不能说“能用”。

**三道硬规则**（整个 skill 只有这三条）
- 花钱、对外发送、不可逆的操作，不在模型循环里直接执行。常规操作在代码设定的**累计**额度内自动执行，超出额度的交给人。
- 测试绝不碰生产环境。
- 没有重新跑过评测，就不宣称行为没问题。

**“冒出这个念头就该停”对照表**：每一条都配有推翻它的真实事故。比如“测试都绿了”“把提示词写得更强硬点”“评分模型给了 4.8 分”“每一步都让人点确认”。

**按需加载的参考资料**，覆盖这些主题：
- 要不要做成 agent；
- 工具契约；
- 循环与上下文；
- 安全与确认门；
- 评测与评分模型校准；
- 按症状定位该修哪一层；
- 上线运维；
- 66 个来源，以及它们之间的分歧。

**经过测试的参考代码**：TypeScript，零依赖，Node ≥ 23.6。共 14 个测试，每道防护都做过“故意改坏”的检验。建议照着改进自己的项目，不要当框架直接引用。

**开销**：每个会话常驻约 140 token（skill 列表里的一条描述），触发时约 1.9k token；参考资料按需才加载（用 `claude plugin details` 测得）。

## 效果如何

我们按 [superpowers](https://github.com/obra/superpowers) 测 skill 的方法来测它：先看没有 skill 时哪里出错，再写 skill，最后按评审发现的问题修正。完整过程见 [`evidence/`](evidence/README.md)。
- 6 个 agent 场景里有 5 个自动触发了这个 skill。普通的批量翻译脚本没有误触发。
- 盲评中，只要 skill 触发了，“行为可验证性”都比没装时高约 2 分（满分 5），安全判断持平。这 4 组对比里，评审有 3 组更认可装了 skill 的版本。
- 代价是“分寸”有 3 组各低 1 分，主要是把每一步都设成要人确认。这一点已经修正：改为累计额度，并且不再要求逐步人工确认。
- **v0.2**：拿 40 条埋了 5 类问题的合成调用记录去测，5 类问题都找到了，数量也全对；设计评分模型时，它也会主动先做校准。所以没有另外新增“读调用记录”和“评分模型”两个 skill。
- 局限：每个场景只跑了 1 次，评审只有一位。

## 安装

**Claude Code（插件）**
```
/plugin marketplace add alextangson/harnessed
/plugin install harnessed@harnessed
```

**Claude Code（个人 skill）**
```bash
git clone https://github.com/alextangson/harnessed ~/harnessed
```
```bash
ln -s ~/harnessed/skills/agent-craft ~/.claude/skills/agent-craft
```

**Codex**
```bash
ln -s ~/harnessed/skills/agent-craft ~/.codex/skills/agent-craft
```

## 致谢

- **方法**来自 Jesse Vincent 的 [superpowers](https://github.com/obra/superpowers)：用“先让它失败、再写、再修正”的方式给 skill 做压力测试。我们借鉴了方法，但没照搬它“铁律”式的强硬语气，因为 Claude 5 代模型对强硬措辞容易过度反应。
- **资料**来自 Anthropic 和 OpenAI 的工程文章，以及 HumanLayer、Manus、Cognition、Hamel Husain 和 Shreya Shankar、Simon Willison、Sierra、Cursor、Vercel、Chroma、美团等团队和个人的实战分享，完整列表见 [`sources.md`](skills/agent-craft/references/sources.md)。
- **标 [P] 的事故**来自作者自己的电商出图 agent（2026 年）。

## 许可

MIT
