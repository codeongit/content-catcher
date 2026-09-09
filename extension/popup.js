const $ = (selector) => document.querySelector(selector);
const views = { idle: $("#idle"), loading: $("#loading"), error: $("#error"), result: $("#result") };
let article = null;
let activeView = "markdown";

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
  $("#readinessTitle").textContent = needsReview ? "建议确认后分析" : "可直接分析";
  const list = $("#readinessIssues");
  list.replaceChildren(...readiness.issues.map((issue) => {
    const item = document.createElement("li");
    item.textContent = issue.message;
    return item;
  }));
  list.classList.toggle("hidden", !readiness.issues.length);
}

function modelInput() {
  const hints = (article?.analysisReadiness?.issues || []).map((issue) => `抓取提示：${issue.modelHint}`);
  return [
    "请仅基于以下抓取内容进行总结和分析。",
    "若内容不完整或证据不足，请明确说明限制，不要猜测缺失内容。",
    "请提炼核心观点、关键依据和重要结论。",
    ...hints,
    "",
    article.markdown
  ].join("\n");
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
  await navigator.clipboard.writeText(modelInput());
  showCopied($("#copyForAi"), "复制给模型");
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
