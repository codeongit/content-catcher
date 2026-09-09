# Content Catcher

Content Catcher 是一个本地运行的 Chrome 扩展，用来识别当前网页的主要内容并导出 Markdown。

## 功能

- 通用新闻、博客和文章页面正文识别
- 微信公众号文章专项清洗
- 提取标题、作者、发布日期、站点和原始链接
- 规范化懒加载图片与相对链接
- Markdown 与纯文本预览
- 一键复制或下载 `.md`
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
├── .github/workflows/  GitHub Actions 自动回归
├── extension/          Chrome 扩展源码
├── docs/               架构与维护文档
├── scripts/            打包脚本
├── tests/              静态检查
├── CHANGELOG.md
├── Makefile
└── README.md
```

## 当前边界

- 只处理当前已经加载的页面，不绕过登录、付费墙或网站权限。
- 图片以远程 URL 保留在 Markdown 中，不下载图片文件。
- Chrome 内置页面和扩展商店等受保护页面不能抓取。
- 暂不包含批量抓取、历史库和 AI 分析。

## 诊断样本

解析完成后点击“导出脱敏诊断样本”，扩展会保留 DOM 层级、常见选择器和噪声标记，但会替换正文文本以及图片、链接地址。诊断样本只下载到本地，是否提交到 issue 由用户决定。
