# ADR-0003：首版以 Markdown 为唯一文件导出格式

- Status: Accepted
- Date: 2026-09-09

## Context

候选导出格式包括 Markdown、HTML、JSON、Word 和 PDF。首版需要一种结构清晰、容易检查、方便版本管理和后续 AI 处理的格式。

## Decision

首版文件导出只支持 Markdown，同时提供纯文本预览和复制。Markdown 使用 YAML front matter 保存标题、作者、公众号账号、发布时间、来源、站点和抓取时间。

正文保留标题、段落、列表、引用、代码块、表格、链接和远程图片引用。

## Consequences

- 实现和维护成本低，输出可以直接进入 Git、知识库或 AI 工作流。
- 不承诺像素级还原原网页视觉样式。
- Word、PDF、HTML、JSON 等格式以后按真实需求独立增加，不进入当前核心解析路径。

