# Architecture Decision Records

本目录记录 Content Catcher 已确认的产品和技术决策。代码说明“现在如何实现”，ADR 说明“为什么这样实现、放弃了什么，以及什么情况下可以重新评估”。

## 状态

- `Accepted`：当前有效，开发必须遵守。
- `Superseded`：已被后续 ADR 替代，但保留历史原因。
- `Partially superseded by`：指定部分由后续 ADR 替代，其余决策继续有效。
- `Proposed`：仍在讨论，不能作为默认实现依据。

## 已接受决策

| ADR | 决策 |
| --- | --- |
| [0001](0001-local-first-mvp.md) | 首版采用纯本地、无后端、无 AI API 的实现 |
| [0002](0002-generic-parser-with-site-adapters.md) | 通用解析器与小型站点适配器组合 |
| [0003](0003-markdown-first-export.md) | 首版以 Markdown 为唯一文件导出格式 |
| [0004](0004-redacted-diagnostics-and-synthetic-fixtures.md) | 诊断样本脱敏，测试只使用最小合成 fixture |
| [0005](0005-regression-first-maintenance.md) | 解析问题采用回归优先的维护方式 |
| [0006](0006-semantic-selection-and-conservative-cleanup.md) | 正文选择语义优先，清洗规则保持保守和受限 |
| [0007](0007-advisory-analysis-readiness.md) | 使用少量通用指标提供非阻断的模型分析提示 |
| [0008](0008-evidence-grounded-model-handoff.md) | 使用带抓取上下文的证据化模型交接；格式与交接细节由 ADR-0009、ADR-0011 部分替代 |
| [0009](0009-conversational-feedback.md) | 单一日常分析流程、本地偏好设置与按用户请求保存的轻量反馈；提示版本与证据定位由 ADR-0011 部分替代 |
| [0010](0010-on-demand-obsidian-archive.md) | 使用独立提示按需把已有分析对话中的文章收藏到 Obsidian；收藏版本与原文呈现由 ADR-0013 部分替代 |
| [0011](0011-evidence-index-and-analysis-contract.md) | 使用可回查的证据索引、分阶段清理统计与按主张类型评价的分析契约；分析表达与判断细节由 ADR-0012 部分替代 |
| [0012](0012-decision-oriented-plain-language-analysis.md) | 采用通俗表达默认、按维度覆盖的偏好，以及决策导向和独立验证核对的分析契约；引用表达由 ADR-0014 部分替代 |
| [0013](0013-readable-archive-source.md) | 收藏原文统一直接呈现 Markdown，保留内部代码块并区分聊天交付包装 |
| [0014](0014-readable-evidence-references.md) | 分析默认用章节名与短引文展示依据，索引保留用于核对与按需精确定位；提示版本由 ADR-0015 替代 |
| [0015](0015-core-decision-prioritization.md) | 核心决策优先筛选见解，区分设计价值与效果验证，减少旁支与重复限制；提示版本由 ADR-0016 替代 |
| [0016](0016-standalone-readable-analysis.md) | 分析默认独立可读，先解释问题与方法，再评价证据，不编造例子或缩窄主张；组织与提示版本由 ADR-0017 部分替代 |
| [0017](0017-mainline-analysis-and-shared-limitations.md) | 按主线合并主张、按决策影响排序见解，集中共同证据缺口并减少重复推导；实用见解及版本由 ADR-0018 部分替代 |
| [0018](0018-thesis-centered-insights.md) | 实用见解先提炼文章想改变的认识或做法，不以局部行动替代主旨；版本与选取表达由 ADR-0019 部分替代 |
| [0019](0019-explicit-insight-changes.md) | 优先选主线中的重要改变，直白说明原有做法、建议改变及原因，不虚构读者习惯；版本由 ADR-0020 替代 |
| [0020](0020-question-led-explanation.md) | 每项核心主张围绕一个读者问题解释，用原文例子串起关系并具体说明证据；提示版本与默认组织由 ADR-0021 部分替代 |
| [0021](0021-concise-article-analysis.md) | 默认一句话主旨与 2–3 个要点，解释、依据与关键限制融入要点；精简主提示并分开核对规则和后续交接；提示版本与组织由 ADR-0022、ADR-0023 部分替代 |
| [0022](0022-focused-article-points.md) | 按作者核心论证组织要点，用原文例子解释并自然融入依据、限制与启发，不堆主题或固定标签；提示版本与组织由 ADR-0023 部分替代 |
| [0023](0023-core-logic-and-takeaways.md) | 先概括核心判断，再按实际逻辑关系讲解并提炼借鉴价值；条目数量随内容调整，借鉴内容可单列或融入，不强套流程 |

ADR-0021 统一替代 ADR-0009、0011、0012、0016–0020 中的五部分默认结构、固定章节分工与重复表达要求；各文件保留原文并标注替代范围，证据与安全边界继续有效。

ADR-0023 进一步替代 ADR-0021、ADR-0022 的固定 2–3 点及借鉴内容仅融入要点的安排；不恢复固定五部分，不扩大证据核对或收藏要求。

## 新增或修改决策

新增决策时复制现有 ADR 的结构，使用下一个四位编号。已经实施的决策不要直接改写历史；如果方向改变，新建 ADR 并在旧 ADR 中标注 `Superseded by`。
