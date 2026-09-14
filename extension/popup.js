import { buildModelInput } from "./analysis-prompt.js";
import { buildArchivePrompt } from "./archive-prompt.js";
import { DEFAULT_ANALYSIS_SETTINGS, loadAnalysisSettings, saveAnalysisSettings } from "./analysis-settings.js";

const $ = (selector) => document.querySelector(selector);
const views = { idle: $("#idle"), loading: $("#loading"), error: $("#error"), result: $("#result") };
let article = null;
let activeView = "markdown";
let activeSettings = { ...DEFAULT_ANALYSIS_SETTINGS };

function renderSettings() {
  $("#analysisPreferences").value = activeSettings.preferences;
  $("#feedbackOutputRoot").value = activeSettings.feedbackOutputRoot;
  $("#archiveOutputRoot").value = activeSettings.archiveOutputRoot;
}

function showSettingsStatus(message, isError = false) {
  const status = $("#settingsStatus");
  status.textContent = message;
  status.classList.remove("hidden");
  status.classList.toggle("settingsError", isError);
}

function showArchiveStatus(message, isError = false) {
  const status = $("#archiveStatus");
  status.textContent = message;
  status.classList.remove("hidden");
  status.classList.toggle("archiveError", isError);
}

function saveSettings(candidate, successMessage) {
  try {
    activeSettings = saveAnalysisSettings(window.localStorage, candidate);
    renderSettings();
    showSettingsStatus(successMessage);
  } catch (error) {
    showSettingsStatus(`设置保存失败：${error?.message || String(error)}。继续使用上次有效设置。`, true);
  }
}

try {
  activeSettings = loadAnalysisSettings(window.localStorage);
} catch (error) {
  showSettingsStatus(`分析设置读取失败，已使用默认设置：${error?.message || String(error)}`, true);
}
renderSettings();

function show(name) {
  Object.entries(views).forEach(([key, node]) => node.classList.toggle("hidden", key !== name));
}

function safeFilename(value) {
  return (value || "article").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "article";
}

function render() {
  if (article) $("#preview").value = activeView === "markdown" ? article.markdown : article.text;
}

function renderReadiness() {
  const readiness = article?.analysisReadiness || { status: "ready", issues: [] };
  const needsReview = readiness.status === "review";
  $("#readiness").classList.toggle("ready", !needsReview);
  $("#readiness").classList.toggle("review", needsReview);
  $("#readinessIcon").textContent = needsReview ? "!" : "✓";
  $("#readinessTitle").textContent = needsReview ? "建议检查抓取内容" : "正文抓取正常";
  const list = $("#readinessIssues");
  list.replaceChildren(...readiness.issues.map((issue) => {
    const item = document.createElement("li");
    item.textContent = issue.message;
    return item;
  }));
  list.classList.toggle("hidden", !readiness.issues.length);
}

function showCopied(button, idleLabel) {
  button.textContent = "已复制";
  setTimeout(() => { button.textContent = idleLabel; }, 1200);
}

async function extract() {
  show("loading");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) throw new Error("请在普通网页中使用此扩展。");
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extractor.js"] });
    const parsed = results?.[0]?.result;
    if (!parsed?.ok) throw new Error(parsed?.error || "没有识别到正文。");
    article = parsed.article;
    activeView = "markdown";
    $("#title").textContent = article.title || "未命名文章";
    $("#author").textContent = article.author || article.siteName || "未知作者";
    $("#stats").textContent = `${article.characterCount.toLocaleString()} 字 · ${article.imageCount} 图`;
    $("#source").href = article.url;
    document.querySelectorAll(".tab").forEach((node) => node.classList.toggle("active", node.dataset.view === activeView));
    render();
    renderReadiness();
    show("result");
  } catch (error) {
    $("#errorMessage").textContent = error?.message || String(error);
    show("error");
  }
}

$("#extract").addEventListener("click", extract);
$("#retry").addEventListener("click", extract);
$("#again").addEventListener("click", extract);
document.querySelectorAll(".tab").forEach((node) => node.addEventListener("click", () => {
  activeView = node.dataset.view;
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === node));
  render();
}));
$("#copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("#preview").value);
  showCopied($("#copy"), "复制");
});
$("#copyForAi").addEventListener("click", async () => {
  if (!article) return;
  await navigator.clipboard.writeText(buildModelInput(article, activeSettings));
  showCopied($("#copyForAi"), "复制给模型");
});
$("#copyArchivePrompt").addEventListener("click", async () => {
  const button = $("#copyArchivePrompt");
  try {
    await navigator.clipboard.writeText(buildArchivePrompt({ archiveOutputRoot: activeSettings.archiveOutputRoot }));
    showCopied(button, "复制收藏指令");
    showArchiveStatus("收藏指令已复制。");
  } catch (error) {
    button.textContent = "复制收藏指令";
    showArchiveStatus(`收藏指令复制失败：${error?.message || String(error)}`, true);
  }
});
$("#saveSettings").addEventListener("click", () => {
  saveSettings({
    preferences: $("#analysisPreferences").value,
    feedbackOutputRoot: $("#feedbackOutputRoot").value,
    archiveOutputRoot: $("#archiveOutputRoot").value
  }, "设置已保存，后续复制时生效。");
});
$("#resetSettings").addEventListener("click", () => {
  saveSettings(DEFAULT_ANALYSIS_SETTINGS, "已恢复默认设置。");
});
$("#download").addEventListener("click", async () => {
  if (!article) return;
  const url = URL.createObjectURL(new Blob([article.markdown], { type: "text/markdown;charset=utf-8" }));
  await chrome.downloads.download({ url, filename: `${safeFilename(article.title)}.md`, saveAs: true });
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});
$("#diagnostic").addEventListener("click", async () => {
  if (!article?.diagnostic) return;
  const payload = JSON.stringify(article.diagnostic, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json;charset=utf-8" }));
  await chrome.downloads.download({
    url,
    filename: `content-catcher-diagnostic-${article.diagnostic.site}.json`,
    saveAs: true
  });
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});
