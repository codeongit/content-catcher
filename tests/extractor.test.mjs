import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const extractor = await readFile(new URL("../extension/extractor.js", import.meta.url), "utf8");

async function runFixture(name, url) {
  const html = await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  return runHtml(html, url);
}

function runHtml(html, url) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  dom.window.chrome = { runtime: { getManifest: () => ({ version: "test" }) } };
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
});

test("Diagnostic sample removes article text and remote URLs", async () => {
  const result = await runFixture("wechat-article.html", "https://mp.weixin.qq.com/s/fixture");
  const sample = result.article.diagnostic;
  assert.equal(sample.site, "wechat");
  assert.equal(sample.schemaVersion, 2);
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
