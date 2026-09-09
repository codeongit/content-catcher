(() => {
  const DROP = "script,style,noscript,template,iframe,canvas,svg,nav,footer,form,button,input,select,textarea,[hidden],[aria-hidden='true'],.advertisement,.ads,.ad,.share,.sharing,.social,.comments,.comment,.related,.recommend,.newsletter,.subscribe,.cookie,.modal";
  const POSITIVE = /article|body|content|entry|main|page|post|story|text|正文|文章/i;
  const NEGATIVE = /ad-|ads|aside|banner|breadcrumb|comment|cookie|footer|header|menu|nav|promo|related|share|sidebar|social|subscribe/i;
  const WECHAT_NOISE = /^(在小说阅读器读本章|去阅读|在公众号小说中沉浸阅读|阅读原文|阅读全文)$/;
  const TRAILING_PROMOTION = /(扫描下方二维码|点击阅读原文即可体验|预览时标签不可点|为Agent而生，驱动AI生产力)/i;
  const DIAGNOSTIC_TEXT_KIND = "data-cc-text-kind";

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

  function scoreMetrics(node) {
    const text = normalized(node);
    const links = [...node.querySelectorAll("a")].reduce((sum, item) => sum + normalized(item).length, 0);
    const identity = `${node.id || ""} ${node.className || ""}`;
    const value = text.length < 120 ? -Infinity : Math.min(text.length, 20000) / 80
      + Math.min(node.querySelectorAll("p").length, 40) * 10
      + Math.min(node.querySelectorAll("h1,h2,h3,h4").length, 12) * 3
      + Math.min(node.querySelectorAll("img").length, 12) * 2
      - (links / text.length) * 260
      + (POSITIVE.test(identity) ? 80 : 0)
      - (NEGATIVE.test(identity) ? 120 : 0)
      + (["ARTICLE", "MAIN"].includes(node.tagName) ? 100 : 0);
    return {
      textLength: text.length,
      paragraphCount: node.querySelectorAll("p").length,
      headingCount: node.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
      imageCount: node.querySelectorAll("img").length,
      linkTextLength: links,
      score: Number.isFinite(value) ? Number(value.toFixed(2)) : null
    };
  }

  function score(node) {
    return scoreMetrics(node).score ?? -Infinity;
  }

  function nodeDescriptor(node) {
    const className = typeof node?.className === "string" ? node.className : "";
    return {
      tag: node?.tagName?.toLowerCase?.() || "unknown",
      id: node?.id || "",
      classes: className.split(/\s+/).filter(Boolean).slice(0, 12)
    };
  }

  function candidateSummary(node, selected = false) {
    return { ...nodeDescriptor(node), ...scoreMetrics(node), selected };
  }

  function findContentRoot() {
    const adaptedRoot = activeAdapter()?.contentRoot();
    if (adaptedRoot) {
      return {
        node: adaptedRoot,
        strategy: "site-adapter",
        selector: adaptedRoot.id ? `#${adaptedRoot.id}` : ".rich_media_content",
        candidates: [candidateSummary(adaptedRoot, true)]
      };
    }
    const semanticArticles = [...document.querySelectorAll("article,[itemprop='articleBody']")]
      .filter((node) => normalized(node).length >= 120)
      .map((node) => ({ node, value: score(node) }))
      .sort((a, b) => b.value - a.value);
    if (semanticArticles.length) {
      const selected = semanticArticles[0].node;
      return {
        node: selected,
        strategy: "semantic-article",
        selector: selected.matches("article") ? "article" : "[itemprop='articleBody']",
        candidates: semanticArticles.slice(0, 5).map(({ node }) => candidateSummary(node, node === selected))
      };
    }
    const selectors = ["#js_content", ".rich_media_content", "article", "main article", "[role='main']", "main", "[itemprop='articleBody']", ".post-content", ".entry-content", ".article-content", ".article-body", ".story-body"];
    const candidates = new Set();
    selectors.forEach((selector) => document.querySelectorAll(selector).forEach((node) => candidates.add(node)));
    document.querySelectorAll("section,div").forEach((node) => {
      if (node.children.length && normalized(node).length > 500) candidates.add(node);
    });
    const ranked = [...candidates].map((node) => ({ node, value: score(node) })).sort((a, b) => b.value - a.value);
    const selected = ranked[0]?.node || document.body;
    return {
      node: selected,
      strategy: ranked.length ? "scored-candidate" : "document-body-fallback",
      selector: ranked.length ? "candidate-score" : "body",
      candidates: (ranked.length ? ranked.slice(0, 5) : [{ node: document.body }]).map(({ node }) => candidateSummary(node, node === selected))
    };
  }

  function trimTrailingPromotion(root) {
    const fullText = normalized(root);
    if (!fullText) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const candidates = [];
    let textNode;
    while ((textNode = walker.nextNode())) {
      const value = (textNode.nodeValue || "").trim();
      const markedPromotion = textNode.parentElement?.closest?.(`[${DIAGNOSTIC_TEXT_KIND}="trailing-promotion"]`);
      if (!TRAILING_PROMOTION.test(value) && !markedPromotion) continue;
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

  function contentMetrics(root) {
    return {
      elementCount: root.querySelectorAll("*").length + 1,
      textLength: normalized(root).length,
      paragraphCount: root.querySelectorAll("p").length,
      headingCount: root.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
      imageCount: root.querySelectorAll("img").length,
      linkCount: root.querySelectorAll("a").length,
      listCount: root.querySelectorAll("ul,ol").length,
      codeBlockCount: root.querySelectorAll("pre").length,
      tableCount: root.querySelectorAll("table").length
    };
  }

  function matchedMetadataSelector(selectors, attribute = "content") {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = node?.getAttribute?.(attribute) || node?.textContent;
      if (value?.trim()) return selector;
    }
    return "";
  }

  function diagnosticMetadataField(value, source) {
    return { present: Boolean(value), length: value?.length || 0, source: source || "" };
  }

  function numericHeadingLevel(value, textNode) {
    if (textNode.parentElement?.closest?.("pre,code")) return 0;
    if (/^\d{1,2}\.\d{1,2}(?:\.|\s*)\S/.test(value)) return 3;
    if (/^\d{1,2}\.\s*\S/.test(value)) return 2;
    return 0;
  }

  function lengthPreservingPlaceholder(length, kind, headingLevel = 0) {
    if (headingLevel === 3) {
      const base = "1.1 示例标题";
      return length >= base.length ? base + "文".repeat(length - base.length) : length >= 4 ? `1.1${"文".repeat(length - 3)}` : "文".repeat(length);
    }
    if (headingLevel === 2) {
      const base = "1. 示例标题";
      return length >= base.length ? base + "文".repeat(length - base.length) : length >= 3 ? `1.${"文".repeat(length - 2)}` : "文".repeat(length);
    }
    const label = kind === "trailing-promotion" ? `[尾部推广 ${length} 字]` : kind === "code" ? `[代码 ${length} 字]` : `[文本 ${length} 字]`;
    return label.length <= length ? label + "文".repeat(length - label.length) : "文".repeat(length);
  }

  function redactTextNode(textNode) {
    const raw = textNode.nodeValue || "";
    const value = raw.trim();
    if (!value) return;
    const leading = raw.match(/^\s*/)?.[0] || "";
    const trailing = raw.match(/\s*$/)?.[0] || "";
    const headingLevel = numericHeadingLevel(value, textNode);
    const kind = TRAILING_PROMOTION.test(value) ? "trailing-promotion" : textNode.parentElement?.closest?.("pre,code") ? "code" : headingLevel ? "visual-heading" : "prose";
    textNode.nodeValue = `${leading}${lengthPreservingPlaceholder(value.length, kind, headingLevel)}${trailing}`;
    const parent = textNode.parentElement;
    if (parent && kind !== "prose") parent.setAttribute(DIAGNOSTIC_TEXT_KIND, kind);
    if (parent && [...parent.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE && child.nodeValue.trim()).length === 1) {
      parent.setAttribute("data-cc-text-length", String(value.length));
    }
  }

  function diagnosticSnapshot(root, adapter, context) {
    const snapshot = root.cloneNode(true);
    const allowed = new Set(["id", "class", "role", "itemprop", "datetime", "alt", "href", "src", "data-src", "data-original", "data-lazy-src"]);
    snapshot.querySelectorAll("script,style,noscript,template,form,input,textarea,select,button,iframe").forEach((node) => node.remove());
    [snapshot, ...snapshot.querySelectorAll("*")].forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        if (!allowed.has(attribute.name)) node.removeAttribute(attribute.name);
      });
      if (node.hasAttribute("href")) node.setAttribute("href", "https://example.invalid/link");
      if (node.hasAttribute("src")) node.setAttribute("src", "https://example.invalid/image");
      if (node.hasAttribute("alt")) node.setAttribute("alt", "图片");
      if (node.hasAttribute("datetime")) node.setAttribute("datetime", "2000-01-01T00:00:00Z");
      ["data-src", "data-original", "data-lazy-src"].forEach((name) => {
        if (node.hasAttribute(name)) node.setAttribute(name, "https://example.invalid/image");
      });
    });
    const walker = document.createTreeWalker(snapshot, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      redactTextNode(node);
    }
    const before = contentMetrics(root);
    const after = contentMetrics(context.cleanedContent);
    return {
      schemaVersion: 2,
      extensionVersion: chrome?.runtime?.getManifest?.().version || "unknown",
      site: adapter?.id || "generic",
      hostname: location.hostname,
      capturedAt: new Date().toISOString(),
      scope: "selected-content-root",
      selection: {
        strategy: context.selection.strategy,
        selector: context.selection.selector,
        selected: candidateSummary(root, true),
        candidates: context.selection.candidates
      },
      metadataSelectors: {
        activityName: Boolean(document.querySelector("#activity-name")),
        authorName: Boolean(document.querySelector("#js_author_name, #author_name")),
        accountName: Boolean(document.querySelector("#js_name, .rich_media_meta_nickname")),
        publishTime: Boolean(document.querySelector("#publish_time, time"))
      },
      metadata: context.metadata,
      content: {
        beforeCleanup: before,
        afterCleanup: after,
        cleanup: {
          removedElementCount: Math.max(0, before.elementCount - after.elementCount),
          removedTextLength: Math.max(0, before.textLength - after.textLength),
          trailingPromotionDetected: TRAILING_PROMOTION.test(normalized(root)),
          siteCleanupApplied: Boolean(adapter?.cleanup)
        }
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
    const selection = findContentRoot();
    const rawContent = selection.node;
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
    const diagnostic = diagnosticSnapshot(rawContent, adapter, {
      selection,
      cleanedContent: content,
      metadata: {
        fields: {
          title: diagnosticMetadataField(title, matchedMetadataSelector(["#activity-name", ".rich_media_title", 'meta[property="og:title"]', 'meta[name="twitter:title"]', "h1"]) || (structured.headline ? "json-ld" : "document.title")),
          author: diagnosticMetadataField(author, matchedMetadataSelector(["#js_author_name", "#author_name", '[rel="author"]', '[itemprop="author"]', 'meta[name="author"]', 'meta[property="article:author"]']) || (structuredAuthor ? "json-ld" : account ? "account-fallback" : "")),
          account: diagnosticMetadataField(account, matchedMetadataSelector(["#js_name", ".rich_media_meta_nickname"])),
          publishedAt: diagnosticMetadataField(publishedAt, matchedMetadataSelector(["#publish_time", 'meta[property="article:published_time"]', 'meta[name="date"]', "time[datetime]", "time"], "datetime") || (structured.datePublished ? "json-ld" : "")),
          siteName: diagnosticMetadataField(siteName, matchedMetadataSelector(['meta[property="og:site_name"]']) || "hostname")
        },
        relationships: {
          authorEqualsAccount: Boolean(author && account && author === account)
        }
      }
    });
    let body = promoteVisualHeadings(toMarkdown(content));
    body = body.replace(new RegExp(`^#\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
    const capturedAt = new Date().toISOString();
    const frontMatter = ["---", `title: ${JSON.stringify(title || "未命名文章")}`, author ? `author: ${JSON.stringify(author)}` : "", account && account !== author ? `account: ${JSON.stringify(account)}` : "", publishedAt ? `published: ${JSON.stringify(publishedAt)}` : "", `source: ${JSON.stringify(location.href)}`, `site: ${JSON.stringify(siteName)}`, `captured: ${JSON.stringify(capturedAt)}`, "---"].filter(Boolean).join("\n");
    return { ok: true, article: { title, author, account, publishedAt, siteName, url: location.href, text, markdown: `${frontMatter}\n\n# ${title || "未命名文章"}\n\n${body}\n`, characterCount: text.length, imageCount: content.querySelectorAll("img").length, capturedAt, diagnostic } };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
})();
