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
| [0012](0012-decision-oriented-plain-language-analysis.md) | 采用通俗表达默认、按维度覆盖的偏好，以及决策导向和独立验证核对的分析契约 |
| [0013](0013-readable-archive-source.md) | 收藏原文统一直接呈现 Markdown，保留内部代码块并区分聊天交付包装 |

## 新增或修改决策

新增决策时复制现有 ADR 的结构，使用下一个四位编号。已经实施的决策不要直接改写历史；如果方向改变，新建 ADR 并在旧 ADR 中标注 `Superseded by`。
