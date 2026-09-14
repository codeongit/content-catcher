import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { ANALYSIS_SETTINGS_KEY, DEFAULT_ANALYSIS_SETTINGS } from "../extension/analysis-settings.js";
import { buildArchivePrompt } from "../extension/archive-prompt.js";

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
    content: { beforeCleanup: { textLength: 500 }, cleanup: { removedTextLength: 20 } }
  }
};
const customSettings = {
  preferences: "简短一些，关注实际应用。",
  feedbackOutputRoot: "/tmp/content-catcher-feedback",
  archiveOutputRoot: "/tmp/obsidian-articles"
};
const promptSettings = ({ preferences, feedbackOutputRoot }) => ({ preferences, feedbackOutputRoot });
let popupId = 0;

function memoryStorage(initialSettings) {
  const entries = new Map();
  if (initialSettings !== undefined) entries.set(ANALYSIS_SETTINGS_KEY, JSON.stringify(initialSettings));
  return {
    entries,
    writes: [],
    getItem(key) {
      if (this.readError) throw new Error("Storage read unavailable");
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      if (this.writeError) throw new Error("Storage quota exceeded");
      this.writes.push([key, value]);
      entries.set(key, value);
    }
  };
}

async function withPopup(options = {}, run) {
  const html = await readFile(new URL("../extension/popup.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "https://extension.test/popup.html" });
  const storage = options.storage ?? memoryStorage();
  const copied = [];
  const clipboardAttempts = [];
  const downloads = [];
  const calls = { tabsQuery: [], executeScript: [] };
  const blobs = new Map();
  const globalNames = ["window", "document", "navigator", "chrome", "setTimeout"];
  const previous = Object.fromEntries(globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const previousCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const previousRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  const $ = (selector) => dom.window.document.querySelector(selector);
  const click = async (selector) => {
    $(selector).click();
    await new Promise((resolve) => setImmediate(resolve));
  };
  const copiedSettings = () => JSON.parse(copied.at(-1).match(/<analysis_settings>\n([\s\S]*?)\n<\/analysis_settings>/)[1]);
  Object.defineProperty(dom.window, "localStorage", {
    configurable: true,
    get() {
      if (options.storageAccessError) throw new Error("Storage access denied");
      return storage;
    }
  });
  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (value) => {
      clipboardAttempts.push(value);
      if (options.clipboardError) throw options.clipboardError;
      copied.push(value);
    } }
  });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    chrome: {
      tabs: { query: async (request) => {
        calls.tabsQuery.push(request);
        return options.tabsQuery ? options.tabsQuery(request) : [{ id: 1, url: article.url }];
      } },
      scripting: { executeScript: async (request) => {
        calls.executeScript.push(request);
        return options.executeScript ? options.executeScript(request) : [{ result: { ok: true, article } }];
      } },
      downloads: { download: async (request) => { downloads.push(request); return downloads.length; } }
    },
    setTimeout: () => 0
  };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: (blob) => {
    const url = `blob:test/${blobs.size + 1}`;
    blobs.set(url, blob);
    return url;
  } });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });

  try {
    await import(`../extension/popup.js?test=${++popupId}`);
    if (options.autoExtract !== false) await click("#extract");
    await run({ $, click, copied, clipboardAttempts, copiedSettings, downloads, blobs, storage, calls });
  } finally {
    for (const name of globalNames) {
      if (previous[name]) Object.defineProperty(globalThis, name, previous[name]);
      else delete globalThis[name];
    }
    Object.defineProperty(URL, "createObjectURL", previousCreate);
    Object.defineProperty(URL, "revokeObjectURL", previousRevoke);
    dom.window.close();
  }
}

test("Popup defaults to collapsed settings and preserves all article exports", async () => {
  await withPopup({}, async ({ $, click, copied, copiedSettings, downloads, blobs, storage }) => {
    assert.equal($("#analysisSettings").open, false);
    assert.equal($("#result").contains($("#analysisSettings")), false, "settings stay available outside result state");
    assert.equal($("#analysisPreferences").value, "");
    assert.equal($("#feedbackOutputRoot").value, DEFAULT_ANALYSIS_SETTINGS.feedbackOutputRoot);
    assert.equal($("#archiveOutputRoot").value, DEFAULT_ANALYSIS_SETTINGS.archiveOutputRoot);
    assert.equal($(".archiveAction p").textContent, "粘贴到已有文章分析对话；仅复制指令，不代表已保存。");
    assert.equal($("#readinessTitle").textContent, "正文抓取正常");
    assert.match($(".readinessScope").textContent, /图片内容与外部来源未核验/);
    assert.match($("#preferencesHelp").textContent, /聊天中的修改不会自动同步/);
    assert.match($("#feedbackHelp").textContent, /明确要求记录反馈/);
    assert.match($("#feedbackHelp").textContent, /无法读取外部聊天或确认保存结果/);

    await click("#copyForAi");
    assert.match(copied.at(-1), /"promptVersion": "evidence-v2"/);
    assert.deepEqual(copiedSettings(), promptSettings(DEFAULT_ANALYSIS_SETTINGS));
    assert.ok(copied.at(-1).endsWith(`<captured_content>\n${article.markdown}</captured_content>`));
    assert.equal(storage.entries.size, 0, "copy must not persist article or settings");
    assert.equal(storage.writes.length, 0);

    await click("#copy");
    assert.equal(copied.at(-1), article.markdown);
    await click('[data-view="text"]');
    await click("#copy");
    assert.equal(copied.at(-1), article.text);
    await click("#download");
    assert.equal(downloads[0].filename, "合成文章.md");
    assert.equal(await blobs.get(downloads[0].url).text(), article.markdown);
    await click("#diagnostic");
    assert.deepEqual(JSON.parse(await blobs.get(downloads[1].url).text()), article.diagnostic);
  });
});

test("Popup uses only saved settings and persists them across reopening", async () => {
  const storage = memoryStorage();
  await withPopup({ storage }, async ({ $, click, copied, copiedSettings }) => {
    $("#analysisSettings").open = true;
    $("#analysisPreferences").value = customSettings.preferences;
    $("#feedbackOutputRoot").value = customSettings.feedbackOutputRoot;
    $("#archiveOutputRoot").value = customSettings.archiveOutputRoot;
    await click("#copyForAi");
    assert.deepEqual(copiedSettings(), promptSettings(DEFAULT_ANALYSIS_SETTINGS), "unsaved drafts must not affect analysis");
    await click("#copyArchivePrompt");
    assert.equal(copied.at(-1), buildArchivePrompt({ archiveOutputRoot: DEFAULT_ANALYSIS_SETTINGS.archiveOutputRoot }), "unsaved drafts must not affect archive instructions");
    await click("#saveSettings");
    assert.match($("#settingsStatus").textContent, /设置已保存/);
    await click("#copyForAi");
    assert.deepEqual(copiedSettings(), promptSettings(customSettings));
    await click("#copyArchivePrompt");
    assert.equal(copied.at(-1), buildArchivePrompt({ archiveOutputRoot: customSettings.archiveOutputRoot }));
    assert.deepEqual(JSON.parse(storage.getItem(ANALYSIS_SETTINGS_KEY)), customSettings);
    assert.equal(storage.entries.size, 1);
    $("#analysisPreferences").value = "未保存的第二次修改";
    $("#archiveOutputRoot").value = "/tmp/unsaved-archive";
    await click("#copyForAi");
    assert.deepEqual(copiedSettings(), promptSettings(customSettings));
    await click("#copyArchivePrompt");
    assert.equal(copied.at(-1), buildArchivePrompt({ archiveOutputRoot: customSettings.archiveOutputRoot }));
  });
  await withPopup({ storage }, async ({ $, click, copied, copiedSettings }) => {
    assert.equal($("#analysisSettings").open, false, "expanded state is not persistent");
    assert.equal($("#analysisPreferences").value, customSettings.preferences);
    assert.equal($("#feedbackOutputRoot").value, customSettings.feedbackOutputRoot);
    assert.equal($("#archiveOutputRoot").value, customSettings.archiveOutputRoot);
    await click("#copyForAi");
    assert.deepEqual(copiedSettings(), promptSettings(customSettings));
    await click("#copyArchivePrompt");
    assert.equal(copied.at(-1), buildArchivePrompt({ archiveOutputRoot: customSettings.archiveOutputRoot }));
  });
});

test("Popup restores and persists defaults", async () => {
  const storage = memoryStorage(customSettings);
  await withPopup({ storage }, async ({ $, click, copied, copiedSettings }) => {
    await click("#resetSettings");
    assert.match($("#settingsStatus").textContent, /已恢复默认设置/);
    assert.equal($("#analysisPreferences").value, "");
    assert.equal($("#feedbackOutputRoot").value, DEFAULT_ANALYSIS_SETTINGS.feedbackOutputRoot);
    assert.equal($("#archiveOutputRoot").value, DEFAULT_ANALYSIS_SETTINGS.archiveOutputRoot);
    await click("#copyForAi");
    assert.deepEqual(copiedSettings(), promptSettings(DEFAULT_ANALYSIS_SETTINGS));
    await click("#copyArchivePrompt");
    assert.equal(copied.at(-1), buildArchivePrompt({ archiveOutputRoot: DEFAULT_ANALYSIS_SETTINGS.archiveOutputRoot }));
  });
  await withPopup({ storage }, async ({ click, copied, copiedSettings }) => {
    await click("#copyForAi");
    assert.deepEqual(copiedSettings(), promptSettings(DEFAULT_ANALYSIS_SETTINGS));
    await click("#copyArchivePrompt");
    assert.equal(copied.at(-1), buildArchivePrompt({ archiveOutputRoot: DEFAULT_ANALYSIS_SETTINGS.archiveOutputRoot }));
  });
});

test("Popup rejects invalid directories without replacing the last valid settings", async () => {
  const storage = memoryStorage(customSettings);
  await withPopup({ storage }, async ({ $, click, copied, copiedSettings }) => {
    for (const path of ["", "relative/path", "~/feedback", "C:relative", "/tmp/\u0007feedback"]) {
      $("#analysisPreferences").value = "不要使用的草稿";
      $("#feedbackOutputRoot").value = path;
      await click("#saveSettings");
      assert.equal($("#settingsStatus").classList.contains("settingsError"), true);
      assert.match($("#settingsStatus").textContent, /设置保存失败/);
      await click("#copyForAi");
      assert.deepEqual(copiedSettings(), promptSettings(customSettings));
      assert.deepEqual(JSON.parse(storage.getItem(ANALYSIS_SETTINGS_KEY)), customSettings);
    }
    for (const path of ["", "relative/archive", "C:relative", "/tmp/\u0007archive"]) {
      $("#analysisPreferences").value = customSettings.preferences;
      $("#feedbackOutputRoot").value = customSettings.feedbackOutputRoot;
      $("#archiveOutputRoot").value = path;
      await click("#saveSettings");
      assert.equal($("#settingsStatus").classList.contains("settingsError"), true);
      await click("#copyArchivePrompt");
      assert.equal(copied.at(-1), buildArchivePrompt({ archiveOutputRoot: customSettings.archiveOutputRoot }));
      assert.deepEqual(JSON.parse(storage.getItem(ANALYSIS_SETTINGS_KEY)), customSettings);
    }
    $("#feedbackOutputRoot").value = "C:\\feedback";
    $("#archiveOutputRoot").value = "D:\\articles";
    await click("#saveSettings");
    assert.equal($("#settingsStatus").classList.contains("settingsError"), false);
    await click("#copyForAi");
    assert.equal(copiedSettings().feedbackOutputRoot, "C:\\feedback");
    await click("#copyArchivePrompt");
    assert.equal(copied.at(-1), buildArchivePrompt({ archiveOutputRoot: "D:\\articles" }));
  });
});

test("Popup reports corrupt or unreadable storage and keeps default analysis available", async () => {
  const invalidJson = memoryStorage();
  invalidJson.entries.set(ANALYSIS_SETTINGS_KEY, "{broken");
  const unavailable = memoryStorage();
  unavailable.readError = true;
  const cases = [
    { storage: invalidJson },
    { storage: memoryStorage(null) },
    { storage: memoryStorage({ feedbackOutputRoot: "relative/path" }) },
    { storage: unavailable },
    { storageAccessError: true }
  ];
  for (const options of cases) {
    await withPopup(options, async ({ $, click, copiedSettings }) => {
      assert.equal($("#analysisSettings").open, false);
      assert.equal($("#settingsStatus").classList.contains("hidden"), false);
      assert.match($("#settingsStatus").textContent, /读取失败，已使用默认设置/);
      assert.equal($("#archiveOutputRoot").value, DEFAULT_ANALYSIS_SETTINGS.archiveOutputRoot);
      await click("#copyForAi");
      assert.deepEqual(copiedSettings(), promptSettings(DEFAULT_ANALYSIS_SETTINGS));
    });
  }
});

test("Popup fills the archive default for valid legacy settings without rewriting storage", async () => {
  const legacySettings = promptSettings(customSettings);
  const storage = memoryStorage(legacySettings);
  await withPopup({ storage }, async ({ $, click, copied, copiedSettings }) => {
    assert.equal($("#settingsStatus").classList.contains("hidden"), true);
    assert.equal($("#archiveOutputRoot").value, DEFAULT_ANALYSIS_SETTINGS.archiveOutputRoot);
    assert.equal(storage.writes.length, 0, "loading legacy settings must not migrate them eagerly");
    await click("#copyForAi");
    assert.deepEqual(copiedSettings(), legacySettings);
    await click("#copyArchivePrompt");
    assert.equal(copied.at(-1), buildArchivePrompt({ archiveOutputRoot: DEFAULT_ANALYSIS_SETTINGS.archiveOutputRoot }));
    assert.deepEqual(JSON.parse(storage.getItem(ANALYSIS_SETTINGS_KEY)), legacySettings);
  });
});

test("Popup save and reset failures retain active settings and report failure", async () => {
  const storage = memoryStorage(customSettings);
  await withPopup({ storage }, async ({ $, click, copied, copiedSettings }) => {
    storage.writeError = true;
    $("#analysisPreferences").value = "未保存的偏好";
    $("#feedbackOutputRoot").value = "/tmp/draft-only";
    $("#archiveOutputRoot").value = "/tmp/draft-archive";
    await click("#saveSettings");
    assert.match($("#settingsStatus").textContent, /设置保存失败.*继续使用上次有效设置/);
    assert.equal($("#analysisPreferences").value, "未保存的偏好", "keep draft for retry");
    await click("#copyForAi");
    assert.deepEqual(copiedSettings(), promptSettings(customSettings));
    await click("#copyArchivePrompt");
    assert.equal(copied.at(-1), buildArchivePrompt({ archiveOutputRoot: customSettings.archiveOutputRoot }));
    await click("#resetSettings");
    assert.match($("#settingsStatus").textContent, /设置保存失败/);
    await click("#copyForAi");
    assert.deepEqual(copiedSettings(), promptSettings(customSettings));
    assert.deepEqual(JSON.parse(storage.getItem(ANALYSIS_SETTINGS_KEY)), customSettings);
  });
  await withPopup({ storageAccessError: true }, async ({ $, click, copiedSettings }) => {
    $("#feedbackOutputRoot").value = "/tmp/valid";
    await click("#saveSettings");
    assert.match($("#settingsStatus").textContent, /设置保存失败/);
    await click("#copyForAi");
    assert.deepEqual(copiedSettings(), promptSettings(DEFAULT_ANALYSIS_SETTINGS));
  });
});

test("Archive instructions copy from idle, loading, error, and result without page or storage side effects", async () => {
  const scenarios = [
    { name: "idle", options: { autoExtract: false } },
    { name: "loading", options: { autoExtract: false, executeScript: () => new Promise(() => {}) }, start: true },
    { name: "error", options: { autoExtract: false, executeScript: async () => [{ result: { ok: false, error: "合成失败" } }] }, start: true },
    { name: "result", options: {} }
  ];
  for (const scenario of scenarios) {
    const storage = memoryStorage(customSettings);
    await withPopup({ ...scenario.options, storage }, async ({ $, click, copied, downloads, calls }) => {
      if (scenario.start) await click("#extract");
      assert.equal($(`#${scenario.name}`).classList.contains("hidden"), false, `${scenario.name} should be visible`);
      const before = { tabs: calls.tabsQuery.length, scripts: calls.executeScript.length, writes: storage.writes.length };
      await click("#copyArchivePrompt");
      assert.equal(copied.at(-1), buildArchivePrompt({ archiveOutputRoot: customSettings.archiveOutputRoot }));
      assert.equal($("#copyArchivePrompt").textContent, "已复制");
      assert.match($("#archiveStatus").textContent, /收藏指令已复制/);
      assert.equal($("#archiveStatus").classList.contains("archiveError"), false);
      assert.deepEqual({ tabs: calls.tabsQuery.length, scripts: calls.executeScript.length, writes: storage.writes.length }, before);
      assert.equal(downloads.length, 0);
    });
  }
});

test("Archive clipboard failure is visible and never reports success", async () => {
  await withPopup({ autoExtract: false, clipboardError: new Error("Clipboard denied") }, async ({ $, click, copied, clipboardAttempts, downloads, storage, calls }) => {
    await click("#copyArchivePrompt");
    assert.equal(clipboardAttempts.length, 1);
    assert.equal(copied.length, 0);
    assert.equal($("#copyArchivePrompt").textContent, "复制收藏指令");
    assert.equal($("#archiveStatus").classList.contains("hidden"), false);
    assert.equal($("#archiveStatus").classList.contains("archiveError"), true);
    assert.match($("#archiveStatus").textContent, /收藏指令复制失败.*Clipboard denied/);
    assert.equal(calls.tabsQuery.length, 0);
    assert.equal(calls.executeScript.length, 0);
    assert.equal(downloads.length, 0);
    assert.equal(storage.writes.length, 0);
  });
});
