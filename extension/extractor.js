(() => {
  const DROP = "script,style,noscript,template,iframe,canvas,svg,nav,footer,form,button,input,select,textarea,[hidden],[aria-hidden='true'],.advertisement,.ads,.ad,.share,.sharing,.social,.comments,.comment,.related,.recommend,.newsletter,.subscribe,.cookie,.modal";
  const POSITIVE = /article|body|content|entry|main|page|post|story|text|正文|文章/i;
  const NEGATIVE = /ad-|ads|aside|banner|breadcrumb|comment|cookie|footer|header|menu|nav|promo|related|share|sidebar|social|subscribe/i;
  const WECHAT_NOISE = /^(在小说阅读器读本章|去阅读|在公众号小说中沉浸阅读|阅读原文|阅读全文)$/;
  const TRAILING_PROMOTION = /(扫描下方二维码|点击阅读原文即可体验|预览时标签不可点|为Agent而生，驱动AI生产力)/i;

  const SITE_ADAPTERS = [
    {
      id: "wechat",
      matches: () => location.hostname === "mp.weixin.qq.com",
      contentRoot: () => document.querySelector("#js_content") || document.querySelector(".rich_media_content"),
      account: () => meta(["#js_name", ".rich_media_meta_nickname"]),
      author: () => meta(["#js_author_name", "#author_name"]),
      cleanup: (root) => trimTrailingPromotion(root)
    }
  ];

  function activeAdapter() {
    return SITE_ADAPTERS.find((adapter) => adapter.matches()) || null;
  }

  function normalized(node) {
    return (node?.innerText || node?.textContent || "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function meta(selectors, attribute = "content") {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = node?.getAttribute?.(attribute) || node?.textContent;
      if (value?.trim()) return value.trim();
    }
    return "";
  }

  function jsonLd() {
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const value = JSON.parse(node.textContent);
        const items = Array.isArray(value) ? value : value?.["@graph"] || [value];
        const article = items.find((item) => /Article|BlogPosting|NewsArticle|Report/i.test([item?.["@type"]].flat().join(" ")));
        if (article) return article;
      } catch {}
    }
    return {};
  }

  function score(node) {
    const text = normalized(node);
    if (text.length < 120) return -Infinity;
    const links = [...node.querySelectorAll("a")].reduce((sum, item) => sum + normalized(item).length, 0);
    const identity = `${node.id || ""} ${node.className || ""}`;
    return Math.min(text.length, 20000) / 80
      + Math.min(node.querySelectorAll("p").length, 40) * 10
      + Math.min(node.querySelectorAll("h1,h2,h3,h4").length, 12) * 3
      + Math.min(node.querySelectorAll("img").length, 12) * 2
      - (links / text.length) * 260
      + (POSITIVE.test(identity) ? 80 : 0)
      - (NEGATIVE.test(identity) ? 120 : 0)
      + (["ARTICLE", "MAIN"].includes(node.tagName) ? 100 : 0);
  }

  function findContentRoot() {
    const adaptedRoot = activeAdapter()?.contentRoot();
    if (adaptedRoot) return adaptedRoot;
    const selectors = ["#js_content", ".rich_media_content", "article", "main article", "[role='main']", "main", "[itemprop='articleBody']", ".post-content", ".entry-content", ".article-content", ".article-body", ".story-body"];
    const candidates = new Set();
    selectors.forEach((selector) => document.querySelectorAll(selector).forEach((node) => candidates.add(node)));
    document.querySelectorAll("section,div").forEach((node) => {
      if (node.children.length && normalized(node).length > 500) candidates.add(node);
    });
    return [...candidates].map((node) => ({ node, value: score(node) })).sort((a, b) => b.value - a.value)[0]?.node || document.body;
  }

  function trimTrailingPromotion(root) {
    const fullText = normalized(root);
    if (!fullText) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const candidates = [];
    let textNode;
    while ((textNode = walker.nextNode())) {
      const value = (textNode.nodeValue || "").trim();
      if (!TRAILING_PROMOTION.test(value)) continue;
      if (fullText.lastIndexOf(value) > fullText.length * 0.6) candidates.push(textNode);
    }
    const markerText = candidates[0];
    if (!markerText) return;
    let marker = markerText.parentElement;
    while (marker?.parentElement && marker.parentElement !== root
      && normalized(marker.parentElement).length < 500) {
      marker = marker.parentElement;
    }
    if (!marker || !root.lastChild) return;
    const range = document.createRange();
    range.setStartBefore(marker);
    range.setEndAfter(root.lastChild);
    range.deleteContents();
  }

  function absolute(value) {
    if (!value || /^(data:|blob:|javascript:)/i.test(value)) return value || "";
    try { return new URL(value, location.href).href; } catch { return value; }
  }

  function clean(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll(DROP).forEach((node) => node.remove());
    clone.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-lazy-src") || img.getAttribute("src");
      if (!src || src.startsWith("data:image/gif")) return img.remove();
      img.setAttribute("src", absolute(src));
      ["srcset", "data-src", "data-original", "data-lazy-src", "style", "class"].forEach((name) => img.removeAttribute(name));
    });
    clone.querySelectorAll("a[href]").forEach((link) => {
      const href = absolute(link.getAttribute("href"));
      if (/^https?:/i.test(href)) link.setAttribute("href", href); else link.removeAttribute("href");
    });
    clone.querySelectorAll("*").forEach((node) => {
      ["style", "onclick", "onload"].forEach((name) => node.removeAttribute(name));
      const text = normalized(node);
      if ((NEGATIVE.test(`${node.id || ""} ${node.className || ""}`) && text.length < 500) || WECHAT_NOISE.test(text)) node.remove();
    });
    activeAdapter()?.cleanup?.(clone);
    return clone;
  }

  function diagnosticSnapshot(root, adapter) {
    const snapshot = root.cloneNode(true);
    const allowed = new Set(["id", "class", "role", "itemprop", "datetime", "alt", "href", "src", "data-src", "data-original", "data-lazy-src"]);
    snapshot.querySelectorAll("script,style,form,input,textarea,select,button,iframe").forEach((node) => node.remove());
    snapshot.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        if (!allowed.has(attribute.name)) node.removeAttribute(attribute.name);
      });
      if (node.hasAttribute("href")) node.setAttribute("href", "https://example.invalid/link");
      if (node.hasAttribute("src")) node.setAttribute("src", "https://example.invalid/image");
      ["data-src", "data-original", "data-lazy-src"].forEach((name) => {
        if (node.hasAttribute(name)) node.setAttribute(name, "https://example.invalid/image");
      });
    });
    const walker = document.createTreeWalker(snapshot, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const value = (node.nodeValue || "").trim();
      if (!value || TRAILING_PROMOTION.test(value)) continue;
      const heading = value.match(/^(\d+(?:\.\d+)?\.?)(.*)$/);
      node.nodeValue = heading ? `${heading[1]} 示例标题` : `[文本 ${value.length} 字]`;
    }
    return {
      schemaVersion: 1,
      extensionVersion: chrome?.runtime?.getManifest?.().version || "unknown",
      site: adapter?.id || "generic",
      hostname: location.hostname,
      capturedAt: new Date().toISOString(),
      metadataSelectors: {
        activityName: Boolean(document.querySelector("#activity-name")),
        authorName: Boolean(document.querySelector("#js_author_name, #author_name")),
        accountName: Boolean(document.querySelector("#js_name, .rich_media_meta_nickname")),
        publishTime: Boolean(document.querySelector("#publish_time, time"))
      },
      html: snapshot.outerHTML
    };
  }

  function escapeMd(value) { return value.replace(/([\\`*_[\]<>])/g, "\\$1"); }
  function inline(node) {
    if (node.nodeType === Node.TEXT_NODE) return escapeMd((node.nodeValue || "").replace(/\s+/g, " "));
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const children = [...node.childNodes].map(inline).join("");
    if (node.tagName === "BR") return "  \n";
    if (["STRONG", "B"].includes(node.tagName)) return children.trim() ? `**${children.trim()}**` : "";
    if (["EM", "I"].includes(node.tagName)) return children.trim() ? `*${children.trim()}*` : "";
    if (node.tagName === "CODE") return `\`${(node.textContent || "").replace(/`/g, "\\`")}\``;
    if (node.tagName === "A") return node.getAttribute("href") ? `[${children.trim() || node.href}](${node.getAttribute("href")})` : children;
    if (node.tagName === "IMG") return node.getAttribute("src") ? `![${escapeMd(node.getAttribute("alt") || "图片")}](${node.getAttribute("src")})` : "";
    return children;
  }

  function table(node) {
    const rows = [...node.querySelectorAll("tr")].map((row) => [...row.querySelectorAll("th,td")].map((cell) => normalized(cell).replace(/\|/g, "\\|"))).filter((row) => row.length);
    if (!rows.length) return "";
    const width = Math.max(...rows.map((row) => row.length));
    const pad = (row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")];
    return [pad(rows[0]), Array(width).fill("---"), ...rows.slice(1).map(pad)].map((row) => `| ${row.join(" | ")} |`).join("\n");
  }

  function block(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) return inline(node);
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${inline(node).trim()}\n\n`;
    if (["P", "FIGCAPTION"].includes(tag)) return `${inline(node).trim()}\n\n`;
    if (tag === "IMG") return `${inline(node)}\n\n`;
    if (tag === "HR") return "---\n\n";
    if (tag === "BLOCKQUOTE") return `${normalized(node).split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
    if (tag === "PRE") return `\`\`\`\n${node.textContent.trim()}\n\`\`\`\n\n`;
    if (tag === "TABLE") return `${table(node)}\n\n`;
    if (["UL", "OL"].includes(tag)) {
      const rows = [...node.children].filter((item) => item.tagName === "LI").map((item, index) => {
        const value = [...item.childNodes].filter((child) => !(child.nodeType === Node.ELEMENT_NODE && ["UL", "OL"].includes(child.tagName))).map(inline).join("").trim();
        if (!value && !item.querySelector("ul,ol")) return "";
        const marker = tag === "OL" ? `${index + 1}.` : "-";
        const nested = [...item.children].filter((child) => ["UL", "OL"].includes(child.tagName)).map((child) => block(child, depth + 1).trim().replace(/^/gm, "  ")).join("\n");
        return `${"  ".repeat(depth)}${marker} ${value}${nested ? `\n${nested}` : ""}`;
      }).filter(Boolean);
      return rows.length ? `${rows.join("\n")}\n\n` : "";
    }
    const children = [...node.childNodes].map((child) => block(child, depth)).join("");
    return ["ARTICLE", "ASIDE", "DIV", "FIGURE", "MAIN", "SECTION"].includes(tag) ? `${children.trim()}\n\n` : children;
  }

  function toMarkdown(root) {
    return [...root.childNodes].map((node) => block(node)).join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function promoteVisualHeadings(markdown) {
    let inFence = false;
    return markdown.split("\n").map((line) => {
      const value = line.trim();
      if (value.startsWith("```")) {
        inFence = !inFence;
        return line;
      }
      if (inFence || !value || value.startsWith("#")) return line;
      if (/^(前言|序言|结语|总结|参考资料)$/.test(value)) return `## ${value}`;
      const subheading = value.match(/^\*\*(\d{1,2}\.\d{1,2}\s*[^*]{1,90})\*\*$/);
      if (subheading) return `### ${subheading[1].replace(/^(\d+\.\d+)(?=\S)/, "$1 ")}`;
      if (/^\d{1,2}\.\d{1,2}(?!\d)\s*\S.{0,90}$/.test(value)) {
        return `### ${value.replace(/^(\d+\.\d+)(?=\S)/, "$1 ")}`;
      }
      if (/^\d{1,2}\.(?!\d)\s*\S.{0,90}$/.test(value)) {
        return `## ${value.replace(/^(\d+\.)(?=\S)/, "$1 ")}`;
      }
      return line;
    }).join("\n");
  }

  try {
    const adapter = activeAdapter();
    const structured = jsonLd();
    const rawContent = findContentRoot();
    const diagnostic = diagnosticSnapshot(rawContent, adapter);
    const content = clean(rawContent);
    const text = normalized(content);
    if (text.length < 120) return { ok: false, error: "页面正文太短，可能不是文章页面或内容尚未加载。" };
    const title = meta(["#activity-name", ".rich_media_title", 'meta[property="og:title"]', 'meta[name="twitter:title"]', "h1"]) || structured.headline || document.title;
    const authorValue = structured.author;
    const structuredAuthor = Array.isArray(authorValue) ? authorValue.map((item) => item?.name || item).filter(Boolean).join(", ") : authorValue?.name || authorValue || "";
    const account = adapter?.account?.() || "";
    const author = adapter?.author?.() || meta(['[rel="author"]', '[itemprop="author"]', 'meta[name="author"]', 'meta[property="article:author"]']) || structuredAuthor || account;
    const publishedAt = meta(["#publish_time", 'meta[property="article:published_time"]', 'meta[name="date"]', "time[datetime]", "time"], "datetime") || structured.datePublished || "";
    const siteName = meta(['meta[property="og:site_name"]']) || location.hostname;
    let body = promoteVisualHeadings(toMarkdown(content));
    body = body.replace(new RegExp(`^#\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
    const capturedAt = new Date().toISOString();
    const frontMatter = ["---", `title: ${JSON.stringify(title || "未命名文章")}`, author ? `author: ${JSON.stringify(author)}` : "", account && account !== author ? `account: ${JSON.stringify(account)}` : "", publishedAt ? `published: ${JSON.stringify(publishedAt)}` : "", `source: ${JSON.stringify(location.href)}`, `site: ${JSON.stringify(siteName)}`, `captured: ${JSON.stringify(capturedAt)}`, "---"].filter(Boolean).join("\n");
    return { ok: true, article: { title, author, account, publishedAt, siteName, url: location.href, text, markdown: `${frontMatter}\n\n# ${title || "未命名文章"}\n\n${body}\n`, characterCount: text.length, imageCount: content.querySelectorAll("img").length, capturedAt, diagnostic } };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
})();
