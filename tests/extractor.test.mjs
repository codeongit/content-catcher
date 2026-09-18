import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const extractor = await readFile(new URL("../extension/extractor.js", import.meta.url), "utf8");

async function runFixture(name, url) {
  const html = await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  return runHtml(html, url);
}

function runHtml(html, url, configure) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  dom.window.chrome = { runtime: { getManifest: () => ({ version: "test" }) } };
  configure?.(dom.window);
  return dom.window.eval(extractor);
}

test("WeChat adapter separates metadata, promotes headings and removes trailing promotion", async () => {
  const result = await runFixture("wechat-article.html", "https://mp.weixin.qq.com/s/fixture");
  assert.equal(result.ok, true);
  assert.equal(result.article.author, "示例作者");
  assert.equal(result.article.account, "示例公众号");
  assert.match(result.article.markdown, /## 1\. 第一章/);
  assert.match(result.article.markdown, /### 1\.1 子章节/);
  assert.doesNotMatch(result.article.markdown, /页面导航不应进入正文/);
  assert.doesNotMatch(result.article.markdown, /扫描下方二维码/);
  assert.doesNotMatch(result.article.markdown, /推广二维码/);
  assert.equal(result.article.analysisReadiness.status, "ready");
  assert.equal(result.article.analysisReadiness.issues.length, 0);
});

test("Generic scoring prefers article content over navigation and sidebar", async () => {
  const result = await runFixture("generic-article.html", "https://example.com/posts/fixture");
  assert.equal(result.ok, true);
  assert.equal(result.article.title, "通用文章测试");
  assert.match(result.article.markdown, /这是正文中的关键句/);
  assert.doesNotMatch(result.article.markdown, /侧边栏推荐内容/);
  assert.equal(result.article.diagnostic.site, "generic");
  assert.equal(result.article.diagnostic.selection.strategy, "semantic-article");
  assert.equal(result.article.diagnostic.selection.selector, "article");
  assert.equal(result.article.diagnostic.selection.candidates[0].selected, true);
  assert.equal(result.article.analysisReadiness.status, "ready");
});

test("Analysis readiness only flags short content when semantic extraction is otherwise clear", async () => {
  const result = await runFixture("short-article.html", "https://example.com/short");
  assert.equal(result.ok, true);
  assert.equal(result.article.diagnostic.selection.strategy, "semantic-article");
  assert.equal(result.article.analysisReadiness.status, "review");
  assert.equal(result.article.analysisReadiness.issues.map((issue) => issue.code).join(","), "short-content");
});

test("Analysis readiness warns when the parser falls back to the whole page", async () => {
  const result = await runFixture("body-fallback.html", "https://example.com/fallback");
  assert.equal(result.ok, true);
  assert.equal(result.article.diagnostic.selection.strategy, "document-body-fallback");
  assert.equal(result.article.analysisReadiness.status, "review");
  assert.equal(result.article.analysisReadiness.issues.map((issue) => issue.code).join(","), "body-fallback");
});

test("Analysis readiness warns only on substantial cleanup loss", async () => {
  const result = await runFixture("large-cleanup.html", "https://example.com/cleanup");
  assert.equal(result.ok, true);
  assert.equal(result.article.diagnostic.selection.strategy, "semantic-article");
  assert.ok(result.article.diagnostic.content.cleanup.removedTextLength > 1000);
  assert.equal(result.article.analysisReadiness.status, "review");
  assert.equal(result.article.analysisReadiness.issues.map((issue) => issue.code).join(","), "large-cleanup");
  assert.equal(result.article.diagnostic.analysisReadiness.status, "review");
});

test("Diagnostic sample removes article text and remote URLs", async () => {
  const result = await runFixture("wechat-article.html", "https://mp.weixin.qq.com/s/fixture");
  const sample = result.article.diagnostic;
  assert.equal(sample.site, "wechat");
  assert.equal(sample.schemaVersion, 3);
  assert.equal(sample.scope, "selected-content-root");
  assert.equal(sample.selection.strategy, "site-adapter");
  assert.equal(sample.selection.selector, "#js_content");
  assert.equal(sample.selection.selected.selected, true);
  assert.equal(sample.metadata.fields.author.present, true);
  assert.equal(sample.metadata.fields.author.source, "#js_author_name");
  assert.equal(sample.metadata.fields.account.source, "#js_name");
  assert.equal(sample.metadata.relationships.authorEqualsAccount, false);
  assert.equal(sample.content.cleanup.trailingPromotionDetected, true);
  assert.ok(sample.content.cleanup.removedElementCount > 0);
  assert.ok(sample.content.cleanup.removedTextLength > 0);
  assert.doesNotMatch(JSON.stringify(sample), /这是文章正文内容|扫描下方二维码|点击阅读原文|正文图片|推广二维码|示例作者|示例公众号|微信文章测试|2026年9月9日|mmbiz\.qpic\.cn/);
  assert.match(sample.html, /\[文本 \d+ 字\]/);
  assert.match(sample.html, /data-cc-text-kind="trailing-promotion"/);
  for (const [url] of sample.html.matchAll(/https?:\/\/[^"'\s<>]+/g)) {
    assert.match(url, /^https:\/\/example\.invalid\//);
  }

  const originalHtml = await readFile(new URL("./fixtures/wechat-article.html", import.meta.url), "utf8");
  const originalDom = new JSDOM(originalHtml);
  const diagnosticDom = new JSDOM(sample.html);
  assert.equal(
    diagnosticDom.window.document.querySelector("#diagnostic-prose").textContent.length,
    originalDom.window.document.querySelector("#diagnostic-prose").textContent.length
  );

  const replayed = runHtml(`<!doctype html><body>${sample.html}</body>`, "https://mp.weixin.qq.com/s/diagnostic");
  assert.equal(replayed.ok, true);
  assert.match(replayed.article.markdown, /## 1\./);
  assert.match(replayed.article.markdown, /### 1\.1/);
  assert.doesNotMatch(replayed.article.text, /尾部推广/);
});

test("Code serialization preserves whitespace, line markup, highlighted comments and fence contents", async () => {
  const result = await runFixture("code-preservation.html", "https://example.invalid/code");
  assert.equal(result.ok, true);
  const blocks = [...result.article.markdown.matchAll(/^(`{3,})\n([\s\S]*?)^\1(?=\n|$)/gm)];
  assert.deepEqual(blocks.map((match) => match[2]), [
    '\n  const message = "hello";  \n\n\n\treturn message;\n',
    'if (ready) {\n  start();\n}\n',
    '// retain comment\nreturn 1;\n',
    'first();\n\n  second();\n',
    'outer();\n  inner();\n\nlast();\n',
    'first();\nsecond();\n',
    'const fence = "````";\n1. code stays code\n',
    'CONTENTCATCHERCODE0END\n'
  ]);
  assert.equal(blocks[6][1], "`````");
  assert.match(result.article.markdown, /\n\nCONTENTCATCHERCODE0END\n/);
  assert.doesNotMatch(result.article.markdown, /CONTENTCATCHERCODEX\d+END/);
  const replayed = runHtml(`<!doctype html><body>${result.article.diagnostic.html}</body>`, "https://example.invalid/diagnostic");
  const replayedBlocks = [...replayed.article.markdown.matchAll(/^(`{3,})\n([\s\S]*?)^\1(?=\n|$)/gm)];
  assert.deepEqual(replayedBlocks.map((match) => match[2]), blocks.map((match) => match[2].replace(/[^\s]/g, "文")));
  assert.doesNotMatch(result.article.diagnostic.html, /retain comment|return message|const fence/);
});

for (const [site, url] of [["generic", "https://example.invalid/headings"], ["wechat", "https://mp.weixin.qq.com/s/headings"]]) {
  test(`${site} extraction preserves lists, numbered paragraphs and ambiguous section text`, async () => {
    const result = await runFixture("heading-boundaries.html", url);
    assert.equal(result.ok, true);
    const markdown = result.article.markdown;
    assert.match(markdown, /\n1\. 观察现象\n2\. 验证结果\n   - 保留嵌套步骤/);
    assert.match(markdown, /\n3\. 普通编号论点保留为段落。\n/);
    assert.doesNotMatch(markdown, /^#{1,6} .*第[一二][部卷]候选内容/m);
    assert.match(markdown, /1\.1\.1三级编号保持原样/);
    assert.doesNotMatch(markdown, /^#{1,6} .*三级编号保持原样/m);
    assert.doesNotMatch(markdown, /^#{1,6} (?:2\.|2\.1|3\.|3\.1|4\.1|5\.1|6\.)/m);
    assert.match(markdown, /## 原生标题保留/);
    if (site === "wechat") {
      assert.match(markdown, /## 1\. 第一章/);
      assert.match(markdown, /### 1\.1 子章节/);
    } else {
      assert.doesNotMatch(markdown, /^#{1,6} 1\./m);
    }
  });
}

test("Diagnostic replay preserves conservative WeChat visual heading decisions", async () => {
  const result = await runFixture("heading-boundaries.html", "https://mp.weixin.qq.com/s/headings");
  const sample = result.article.diagnostic;
  assert.equal(sample.schemaVersion, 3);
  assert.doesNotMatch(JSON.stringify(sample), /一个待验证的观点|子章节|普通编号论点|完整句子|列表内不能提升/);
  const replayed = runHtml(`<!doctype html><body>${sample.html}</body>`, "https://mp.weixin.qq.com/s/diagnostic");
  assert.equal(replayed.ok, true);
  const before = result.article.markdown.match(/^#{2,6} .+$/gm);
  const after = replayed.article.markdown.match(/^#{2,6} .+$/gm);
  assert.equal(before.length, 3);
  assert.equal(after.length, 3);
  assert.deepEqual(after.map((heading) => heading.match(/^#+/)[0]), before.map((heading) => heading.match(/^#+/)[0]));
});

test("WeChat trailing promotion detection does not truncate a code example", () => {
  const html = `<div id="js_content"><p>${"用于检查代码末尾保护的合成正文。".repeat(30)}</p><pre><code>// 扫描下方二维码\nkeepExample();</code></pre></div>`;
  const result = runHtml(html, "https://mp.weixin.qq.com/s/code-tail");
  assert.equal(result.ok, true);
  assert.match(result.article.markdown, /```\n\/\/ 扫描下方二维码\nkeepExample\(\);\n```/);
  assert.doesNotMatch(result.article.diagnostic.html, /扫描下方二维码|keepExample/);
  const replayed = runHtml(result.article.diagnostic.html, "https://mp.weixin.qq.com/s/diagnostic");
  assert.equal(replayed.article.diagnostic.content.afterCleanup.codeBlockCount, 1);
});

test("Cleanup stages count removed subtrees once and separate conversion from deletion", async () => {
  const result = await runFixture("cleanup-stages.html", "https://mp.weixin.qq.com/s/stages");
  assert.equal(result.ok, true);
  const diagnostic = result.article.diagnostic;
  const cleanup = diagnostic.content.cleanup;
  assert.equal(diagnostic.schemaVersion, 3);
  assert.deepEqual(Array.from(cleanup.stages, (stage) => [stage.rule, stage.removedElementCount]), [
    ["structure", 3], ["placeholder-images", 2], ["noise", 4], ["site-tail", 4]
  ]);
  assert.equal(cleanup.stages.reduce((sum, stage) => sum + stage.removedElementCount, 0), cleanup.removedElementCount);
  assert.equal(cleanup.stages.reduce((sum, stage) => sum + stage.removedTextLength, 0), cleanup.removedTextLength);
  assert.equal(cleanup.stages[1].removedTextLength, 0);
  assert.equal(cleanup.siteCleanupApplied, true);
  assert.equal(diagnostic.content.beforeCleanup.headingCount, 0);
  assert.equal(diagnostic.content.afterCleanup.headingCount, 0, "heading conversion is not cleanup loss");
  assert.match(result.article.markdown, /### 1\.1 章节标题/);
  assert.match(result.article.markdown, /最后一个真实段落必须保留/);
  assert.match(result.article.markdown, /\/\/ retained annotation\nkeepBody\(\);/);
  assert.doesNotMatch(result.article.markdown, /PRIVATE_|扫描下方二维码|点击阅读原文即可体验/);
  assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE_|retained annotation|keepBody|最后一个真实段落必须保留/);
  for (const stage of cleanup.stages) {
    assert.deepEqual(Object.keys(stage).sort(), ["removedElementCount", "removedTextLength", "rule"]);
    assert.ok(Number.isInteger(stage.removedElementCount) && stage.removedElementCount >= 0);
    assert.ok(Number.isFinite(stage.removedTextLength) && stage.removedTextLength >= 0);
  }
  const replayed = runHtml(diagnostic.html, "https://mp.weixin.qq.com/s/replay");
  // Diagnostics strip scripts/forms and replace image URLs before replay.
  // Compare the noise/tail branches whose safe structure is retained.
  assert.deepEqual(JSON.parse(JSON.stringify(replayed.article.diagnostic.content.cleanup.stages.slice(2))), JSON.parse(JSON.stringify(cleanup.stages.slice(2))));
});

test("Site cleanup reports actual truncation rather than adapter presence or matching words", async () => {
  const generic = await runFixture("cleanup-stages.html", "https://example.invalid/stages");
  assert.equal(generic.article.diagnostic.content.cleanup.siteCleanupApplied, false);
  assert.deepEqual(JSON.parse(JSON.stringify(generic.article.diagnostic.content.cleanup.stages.at(-1))), {
    rule: "site-tail", removedElementCount: 0, removedTextLength: 0
  });
  assert.match(generic.article.markdown, /扫描下方二维码/);
  const early = runHtml(`<div id="js_content"><p>扫描下方二维码</p><p>${"后续正常内容足够长，前部提及推广不应截断。".repeat(30)}</p></div>`, "https://mp.weixin.qq.com/s/early");
  assert.equal(early.article.diagnostic.content.cleanup.trailingPromotionDetected, true);
  assert.equal(early.article.diagnostic.content.cleanup.siteCleanupApplied, false);
  assert.equal(early.article.diagnostic.content.cleanup.stages.at(-1).removedElementCount, 0);
  assert.match(early.article.markdown, /后续正常内容/);
});

test("Cleanup metrics use the same text basis for rendered roots and detached clones", () => {
  const visible = "正常显示的合成正文用于核对指标统计，不应该随节点是否挂载而改变计数。".repeat(12);
  const hidden = "不可见的合成脚本文本".repeat(220);
  const html = `<article><p>${visible}</p><script>${hidden}</script></article>`;
  const plain = runHtml(html, "https://example.invalid/metrics");
  const rendered = runHtml(html, "https://example.invalid/metrics", (window) => {
    // Model the layout-aware live root without changing its textContent/clone.
    Object.defineProperty(window.document.querySelector("article"), "innerText", { value: visible });
  });
  const metrics = rendered.article.diagnostic.content;
  assert.deepEqual(JSON.parse(JSON.stringify(metrics)), JSON.parse(JSON.stringify(plain.article.diagnostic.content)));
  assert.equal(metrics.cleanup.removedTextLength, hidden.length);
  assert.equal(metrics.cleanup.stages.reduce((sum, stage) => sum + stage.removedTextLength, 0), metrics.cleanup.removedTextLength);
  assert.equal(rendered.article.analysisReadiness.status, plain.article.analysisReadiness.status);
});

test("Blockquotes and list items retain nested fenced code and container prefixes", async () => {
  const result = await runFixture("nested-code.html", "https://example.invalid/nested-code");
  assert.equal(result.ok, true);
  const markdown = result.article.markdown;
  const examples = [
    { opening: "> ", continuation: "> ", fence: "```", code: '\n  quoted();  \n\n\tquotedEnd();\n' },
    { opening: "   ", continuation: "   ", fence: "```", code: 'if (ready) {\n  numbered();\n}\n' },
    { opening: "- ", continuation: "  ", fence: "````", code: 'const ticks = "```";\n  bullet();  \n' },
    { opening: ">    ", continuation: ">    ", fence: "```", code: '  quoteList();\n\n' },
    { opening: "1. > ", continuation: "   > ", fence: "```", code: '  listQuote();  \n' },
    { opening: "   - ", continuation: "     ", fence: "```", code: '  nestedList();\n\n' }
  ];
  const lines = markdown.split("\n");
  for (const example of examples) {
    const start = lines.indexOf(example.opening + example.fence);
    assert.ok(start >= 0, `Missing opening fence: ${JSON.stringify(example.opening + example.fence)}`);
    const end = lines.indexOf(example.continuation + example.fence, start + 1);
    assert.ok(end > start, `Missing closing fence with prefix: ${JSON.stringify(example.continuation)}`);
    const payload = lines.slice(start + 1, end).map((line) => {
      assert.ok(line.startsWith(example.continuation), `Code line left its container: ${JSON.stringify(line)}`);
      return line.slice(example.continuation.length);
    }).join("\n") + "\n";
    assert.equal(payload, example.code);
  }
  assert.match(markdown, /> 引用开头\n>\n> ```/);
  assert.match(markdown, /> ```\n>\n> 引用结尾/);
  assert.match(markdown, /1\. 编号步骤开头\n\n   ```/);
  assert.match(markdown, /   ```\n\n   编号步骤结尾/);
  assert.match(markdown, />    ```\n>\n>    引用中的步骤结束/);
  assert.match(markdown, /1\. 父步骤\n   - ```/);
  assert.doesNotMatch(markdown, /CONTENTCATCHERCODE\w*END/);
});
