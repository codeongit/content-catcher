import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const extractor = await readFile(new URL("../extension/extractor.js", import.meta.url), "utf8");

async function runFixture(name, url) {
  const html = await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
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
});

test("Diagnostic sample removes article text and remote URLs", async () => {
  const result = await runFixture("wechat-article.html", "https://mp.weixin.qq.com/s/fixture");
  const sample = result.article.diagnostic;
  assert.equal(sample.site, "wechat");
  assert.doesNotMatch(sample.html, /这是文章正文内容/);
  assert.doesNotMatch(sample.html, /mmbiz\.qpic\.cn/);
  assert.match(sample.html, /\[文本 \d+ 字\]/);
});
