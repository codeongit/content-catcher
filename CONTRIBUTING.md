# Contributing to Content Catcher

## 开始之前

1. 阅读根目录 `AGENTS.md`。
2. 阅读 `docs/architecture.md` 和 `docs/decisions/README.md`。
3. 解析问题按照 `docs/maintenance-playbook.md` 处理。
4. 确认工作区没有不属于本次任务的修改。

## 开发环境

- Chrome 或 Chromium，用于加载 `extension/`。
- Node.js 22+，用于 jsdom 回归测试。
- Python 3，用于零依赖静态检查。

```bash
npm ci
npm test
npm run check:static
```

扩展没有运行时依赖和构建步骤。修改源码后在 `chrome://extensions/` 点击“重新加载”。

## 代码约定

- 保持 Manifest V3 和最小权限。
- 页面解析代码必须可以在 Chrome isolated world 和 jsdom fixture 中运行。
- 通用逻辑不能依赖远程服务或实时网页。
- 站点判断集中在 `SITE_ADAPTERS`。
- 不在扩展源码、测试或日志中加入 API Key、Cookie、Token 或登录数据。
- 不引入后端、远程分析、遥测或上传行为，除非存在新的 Accepted ADR。

## 修改解析器

解析器变更必须同时包含：

1. 一个最小合成 HTML fixture，或对现有 fixture 的必要扩展。
2. 至少一个先失败、修复后通过的行为断言。
3. 对通用页面和已有站点适配器的全量回归。
4. 必要的架构、ADR 或维护文档更新。

不要提交真实文章全文。真实页面只用于人工验证，仓库只保留合成结构。

## 新增站点适配器

- 只有通用解析无法可靠处理稳定站点差异时才新增。
- 使用稳定、最小的域名匹配和正文选择器。
- 元数据访问器缺失时允许回退到通用元数据。
- 清洗规则必须限制站点和位置，避免删除正文中间的合法内容。
- Fixture 要覆盖站点页面框架、真实正文边界和至少一个关键特殊点。

## 文档职责

- `README.md`：面向用户的功能、安装和开发入口。
- `AGENTS.md`：面向开发 Agent 的短路由和强制边界。
- `docs/architecture.md`：当前系统结构和数据流。
- `docs/decisions/`：长期产品和架构决策及其理由。
- `docs/maintenance-playbook.md`：可执行的维护流程。
- `CHANGELOG.md`：用户可见版本变化。

如果改变了既有 Accepted 决策，不要直接删除历史；新增 ADR，并把旧 ADR 标记为已被替代。

## 提交前检查

```bash
npm test
npm run check:static
git diff --check
```

用户可见变化还需要：

- 更新 `extension/manifest.json` 版本。
- 更新 `CHANGELOG.md`。
- 由人工维护者在 Chrome 中手工抓取至少一个通用页面和相关适配站点，并检查相关界面、剪贴板和下载行为。

真实浏览器相关测试统一由人工负责。Agent 负责离线回归、静态检查、按需打包和提供简短人工检查清单，默认不操作真实浏览器。未收到人工结果时标记“待人工验证”，不视为 Agent 缺少浏览器工具造成的阻塞，也不得声称浏览器测试通过；除非用户明确重新分配这项职责。

## Commit 和 Pull Request

- 一个提交只处理一个明确问题。
- 推荐前缀：`feat:`、`fix:`、`test:`、`docs:`、`refactor:`。
- PR 描述应包含问题、方案、测试结果、隐私或权限影响。
- 不重写已经发布的历史，除非仓库所有者明确要求。
- 合并或直接推送后确认 GitHub Actions 通过。
