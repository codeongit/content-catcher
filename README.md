# Content Catcher

Content Catcher 是一个本地运行的 Chrome 扩展，用来识别当前网页的主要内容并导出 Markdown。

## 功能

- 通用新闻、博客和文章页面正文识别
- 微信公众号文章专项清洗
- 提取标题、作者、发布日期、站点和原始链接
- 规范化懒加载图片与相对链接
- Markdown 与纯文本预览
- 显示面向模型分析的轻量内容提示
- 复制带抓取上下文和证据评价规则的模型分析输入
- 一键复制当前内容、复制给模型或下载 `.md`
- 不上传页面内容，不需要 API Key
- 可主动导出脱敏 DOM 诊断样本，用于复现站点结构问题

## 本地安装

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目中的 `extension/` 目录。

## 开发

扩展本身没有运行时依赖，也不需要构建即可加载。回归测试需要 Node.js 22+。

```bash
npm install
npm test
make check
make package
```

- `make check`：检查 manifest、文件完整性和关键能力。
- `npm test`：使用合成 HTML fixture 运行解析回归测试。
- `make package`：在 `dist/` 中生成可分发 ZIP。

## 目录

```text
content-catcher/
├── AGENTS.md           开发 Agent 的项目入口与约束
├── CONTRIBUTING.md     开发、测试和提交规范
├── .github/workflows/  GitHub Actions 自动回归
├── extension/          Chrome 扩展源码
├── docs/               架构与维护文档
├── scripts/            打包脚本
├── tests/              静态检查
├── CHANGELOG.md
├── Makefile
└── README.md
```

## 项目文档

- [架构说明](docs/architecture.md)
- [架构决策记录](docs/decisions/README.md)
- [解析器维护手册](docs/maintenance-playbook.md)
- [贡献指南](CONTRIBUTING.md)

## 当前边界

- 只处理当前已经加载的页面，不绕过登录、付费墙或网站权限。
- 图片以远程 URL 保留在 Markdown 中，不下载图片文件。
- Chrome 内置页面和扩展商店等受保护页面不能抓取。
- 暂不包含批量抓取、历史库和 AI 分析。

## 用于模型分析

扩展只对可能显著影响模型分析的情况给出建议确认提示：正文较短、只能回退到整个页面、清理阶段删除了大部分文字。提示不会阻止复制或下载，也不检查图片数量、作者缺失和轻微格式问题。

“复制给模型”会在 Markdown 前附加版本化的证据分析契约和抓取上下文。契约要求模型区分原文主张、原文依据与自身推导，只保留有证据的重要结论；实用见解必须说明行动、机制、依据和边界。抓取上下文会明确图片像素没有转写、外链与引用研究没有核验。

界面的“正文抓取正常”只表示正文选择和清理没有触发高影响提示，不表示图片或外部来源已经验证。普通复制和 Markdown 下载仍保持原始内容。扩展本身不调用模型 API，也不会上传页面内容。

## 诊断样本

解析完成后点击“导出脱敏诊断样本”，扩展会保留 DOM 层级、常见选择器、等长安全文本和语义噪声标记，同时替换原始正文、替代文本以及图片和链接地址。诊断摘要还会记录正文选择方式、候选评分、元数据来源及清理前后统计，但不记录元数据原值。诊断样本只下载到本地，是否提交到 issue 由用户决定。
