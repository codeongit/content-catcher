import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

test("Popup labels extraction scope and copies the evidence prompt", async () => {
  const html = await readFile(new URL("../extension/popup.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "https://extension.test/popup.html" });
  const article = {
    title: "合成文章",
    author: "示例作者",
    siteName: "example.test",
    url: "https://example.test/article",
    text: "合成正文",
    markdown: "# 合成文章\n\n合成正文\n",
    characterCount: 480,
    imageCount: 2,
    analysisReadiness: { status: "ready", issues: [] },
    diagnostic: {
      selection: { strategy: "semantic-article" },
      content: {
        beforeCleanup: { textLength: 500 },
        cleanup: { removedTextLength: 20 }
      }
    }
  };
  let copied = "";
  const previous = {
    document: globalThis.document,
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    chrome: globalThis.chrome
  };

  globalThis.document = dom.window.document;
  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (value) => { copied = value; } }
  });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 1, url: article.url }] },
    scripting: { executeScript: async () => [{ result: { ok: true, article } }] },
    downloads: { download: async () => 1 }
  };

  try {
    await import(`../extension/popup.js?test=${Date.now()}`);
    dom.window.document.querySelector("#extract").click();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(dom.window.document.querySelector("#readinessTitle").textContent, "正文抓取正常");
    assert.match(dom.window.document.querySelector(".readinessScope").textContent, /图片内容与外部来源未核验/);

    dom.window.document.querySelector("#copyForAi").click();
    await new Promise((resolve) => setImmediate(resolve));

    assert.match(copied, /"promptVersion": "evidence-v1"/);
    assert.ok(copied.endsWith(`<captured_content>\n${article.markdown}</captured_content>`));
  } finally {
    globalThis.document = previous.document;
    if (previous.navigator) Object.defineProperty(globalThis, "navigator", previous.navigator);
    else delete globalThis.navigator;
    globalThis.chrome = previous.chrome;
    dom.window.close();
  }
});
