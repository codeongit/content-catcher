(() => {
  const STRUCTURAL_DROP = "script,style,noscript,template,iframe,canvas,svg,nav,footer,form,button,input,select,textarea,[hidden],[aria-hidden='true']";
  const NOISE_DROP = ".advertisement,.ads,.ad,.share,.sharing,.social,.comments,.comment,.related,.recommend,.newsletter,.subscribe,.cookie,.modal";
  const POSITIVE = /article|body|content|entry|main|page|post|story|text|正文|文章/i;
  const NEGATIVE = /ad-|ads|aside|banner|breadcrumb|comment|cookie|footer|header|menu|nav|promo|related|share|sidebar|social|subscribe/i;
  const WECHAT_NOISE = /^(在小说阅读器读本章|去阅读|在公众号小说中沉浸阅读|阅读原文|阅读全文)$/;
  const TRAILING_PROMOTION = /(扫描下方二维码|点击阅读原文即可体验|预览时标签不可点|为Agent而生，驱动AI生产力)/i;
  const DIAGNOSTIC_TEXT_KIND = "data-cc-text-kind";
  const DIAGNOSTIC_HEADING_LEVEL = "data-cc-heading-level";

  const SITE_ADAPTERS = [
    {
      id: "wechat",
      matches: () => location.hostname === "mp.weixin.qq.com",
      contentRoot: () => document.querySelector("#js_content") || document.querySelector(".rich_media_content"),
      account: () => meta(["#js_name", ".rich_media_meta_nickname"]),
      author: () => meta(["#js_author_name", "#author_name"]),
      cleanup: (root) => trimTrailingPromotion(root),
      transform: (root) => promoteVisualHeadings(root)
    }
  ];

  function activeAdapter() {
    return SITE_ADAPTERS.find((adapter) => adapter.matches()) || null;
  }

  function normalizeText(value) {
    return value.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function normalized(node) {
    return normalizeText(node?.innerText || node?.textContent || "");
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
      if (textNode.parentElement?.closest("pre,code")) continue;
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
    const stages = [];
    const stage = (rule, apply) => {
      const before = contentMetrics(clone);
      apply();
      const after = contentMetrics(clone);
      stages.push({
        rule,
        removedElementCount: Math.max(0, before.elementCount - after.elementCount),
        removedTextLength: Math.max(0, before.textLength - after.textLength)
      });
    };
    stage("structure", () => {
      clone.querySelectorAll(STRUCTURAL_DROP).forEach((node) => {
        if (clone.contains(node)) node.remove();
      });
    });
    stage("placeholder-images", () => {
      clone.querySelectorAll("img").forEach((img) => {
        if (!clone.contains(img)) return;
        const src = img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-lazy-src") || img.getAttribute("src");
        if (!src || src.startsWith("data:image/gif")) return img.remove();
        img.setAttribute("src", absolute(src));
        ["srcset", "data-src", "data-original", "data-lazy-src", "style", "class"].forEach((name) => img.removeAttribute(name));
      });
    });
    stage("noise", () => {
      clone.querySelectorAll(NOISE_DROP).forEach((node) => {
        if (clone.contains(node) && !node.closest("pre,code")) node.remove();
      });
      clone.querySelectorAll("*").forEach((node) => {
        if (!clone.contains(node) || node.closest("pre,code")) return;
        const text = normalized(node);
        if ((NEGATIVE.test(`${node.id || ""} ${node.className || ""}`) && text.length < 500) || WECHAT_NOISE.test(text)) node.remove();
      });
    });
    clone.querySelectorAll("a[href]").forEach((link) => {
      const href = absolute(link.getAttribute("href"));
      if (/^https?:/i.test(href)) link.setAttribute("href", href); else link.removeAttribute("href");
    });
    clone.querySelectorAll("*").forEach((node) => {
      ["style", "onclick", "onload"].forEach((name) => node.removeAttribute(name));
    });
    stage("site-tail", () => activeAdapter()?.cleanup?.(clone));
    return { content: clone, stages };
  }

  function contentMetrics(root) {
    return {
      elementCount: root.querySelectorAll("*").length + 1,
      // Metrics must not change with layout attachment or innerText availability.
      textLength: normalizeText(root.textContent || "").length,
      paragraphCount: root.querySelectorAll("p").length,
      headingCount: root.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
      imageCount: root.querySelectorAll("img").length,
      linkCount: root.querySelectorAll("a").length,
      listCount: root.querySelectorAll("ul,ol").length,
      codeBlockCount: root.querySelectorAll("pre").length,
      tableCount: root.querySelectorAll("table").length
    };
  }

  function assessAnalysisReadiness(selection, before, after) {
    const issues = [];
    if (after.textLength < 300) {
      issues.push({
        code: "short-content",
        message: `正文仅 ${after.textLength} 字，若原页面明显更长，请等待内容加载后重新抓取。`,
        modelHint: "抓取内容较短，分析时请明确说明证据不足，不要补全缺失内容。"
      });
    }
    if (selection.strategy === "document-body-fallback") {
      issues.push({
        code: "body-fallback",
        message: "页面没有明确的正文区域，内容可能混入导航或推荐。",
        modelHint: "正文来自页面整体回退，分析时请留意可能混入的非正文内容。"
      });
    }
    const removedTextLength = Math.max(0, before.textLength - after.textLength);
    if (removedTextLength > 1000 && removedTextLength / Math.max(1, before.textLength) > 0.5) {
      issues.push({
        code: "large-cleanup",
        message: "清理阶段移除了较多文字，建议检查正文开头和结尾是否完整。",
        modelHint: "清理阶段移除了较多内容，分析结论应以当前可见正文为限。"
      });
    }
    return { status: issues.length ? "review" : "ready", issues: issues.slice(0, 2) };
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

  function diagnosticHeadingLevel(textNode) {
    if (textNode.parentElement?.closest?.("pre,code")) return 0;
    return Number(textNode.parentElement?.closest?.(`[${DIAGNOSTIC_HEADING_LEVEL}]`)?.getAttribute(DIAGNOSTIC_HEADING_LEVEL)) || 0;
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
    const headingLevel = diagnosticHeadingLevel(textNode);
    const kind = textNode.parentElement?.closest?.("pre,code") ? "code" : TRAILING_PROMOTION.test(value) ? "trailing-promotion" : headingLevel ? "visual-heading" : "prose";
    const placeholder = kind === "code" ? value.replace(/[^\s]/g, "文") : lengthPreservingPlaceholder(value.length, kind, headingLevel);
    textNode.nodeValue = `${leading}${placeholder}${trailing}`;
    const parent = textNode.parentElement;
    if (parent && kind !== "prose") parent.setAttribute(DIAGNOSTIC_TEXT_KIND, kind);
    if (parent && [...parent.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE && child.nodeValue.trim()).length === 1) {
      parent.setAttribute("data-cc-text-length", String(value.length));
    }
  }

  function diagnosticSnapshot(root, adapter, context) {
    const snapshot = root.cloneNode(true);
    const visualHeadings = adapter?.id === "wechat"
      ? [...snapshot.querySelectorAll("section")].map((node) => ({ node, level: visualHeadingLevel(node) })).filter(({ level }) => level)
      : [];
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
    visualHeadings.forEach(({ node, level }) => node.setAttribute(DIAGNOSTIC_HEADING_LEVEL, String(level)));
    const walker = document.createTreeWalker(snapshot, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      redactTextNode(node);
    }
    const before = context.beforeMetrics;
    const after = context.afterMetrics;
    return {
      schemaVersion: 3,
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
      analysisReadiness: context.analysisReadiness,
      content: {
        beforeCleanup: before,
        afterCleanup: after,
        cleanup: {
          removedElementCount: Math.max(0, before.elementCount - after.elementCount),
          removedTextLength: Math.max(0, before.textLength - after.textLength),
          trailingPromotionDetected: TRAILING_PROMOTION.test(normalized(root)),
          siteCleanupApplied: context.cleanupStages.some((stage) => stage.rule === "site-tail" && (stage.removedElementCount > 0 || stage.removedTextLength > 0)),
          stages: context.cleanupStages
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

  function codeText(root) {
    const tokens = [];
    const visit = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue) tokens.push({ type: "text", value: node.nodeValue });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === "BR") {
        tokens.push({ type: "text", value: "\n" });
        return;
      }
      const line = ["DIV", "P"].includes(node.tagName);
      if (line) tokens.push({ type: "boundary" });
      const start = tokens.length;
      [...node.childNodes].forEach(visit);
      if (line) {
        const contents = tokens.slice(start);
        if (!contents.length || (contents.length === 1 && contents[0].type === "text" && contents[0].value === "\n")) {
          tokens.splice(start, contents.length, { type: "empty-line" });
        }
        tokens.push({ type: "boundary" });
      }
    };
    [...root.childNodes].forEach(visit);
    let value = "";
    let boundary = false;
    for (const token of tokens) {
      if (token.type === "boundary") {
        boundary = true;
        continue;
      }
      if (token.type === "empty-line") {
        if (value && !value.endsWith("\n")) value += "\n";
        value += "\n";
      } else {
        if (boundary && value && !value.endsWith("\n") && !token.value.startsWith("\n")) value += "\n";
        value += token.value;
      }
      boundary = false;
    }
    if (boundary && value && !value.endsWith("\n")) value += "\n";
    return value;
  }

  function fencedCode(node) {
    const value = codeText(node);
    const longest = [...value.matchAll(/`+/g)].reduce((maximum, [run]) => Math.max(maximum, run.length), 0);
    const fence = "`".repeat(Math.max(3, longest + 1));
    return `${fence}\n${value}${value.endsWith("\n") ? "" : "\n"}${fence}`;
  }

  function blockChildren(node, context) {
    const blockTags = new Set(["ARTICLE", "ASIDE", "DIV", "FIGURE", "MAIN", "SECTION", "P", "FIGCAPTION", "H1", "H2", "H3", "H4", "H5", "H6", "IMG", "HR", "BLOCKQUOTE", "PRE", "TABLE", "UL", "OL"]);
    let output = "";
    let inlineNodes = [];
    const flushInline = (separator = "\n\n") => {
      const value = inlineNodes.map(inline).join("").trim();
      if (value) output += value + separator;
      inlineNodes = [];
    };
    for (const child of node.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE && blockTags.has(child.tagName)) {
        flushInline(["UL", "OL"].includes(child.tagName) ? "\n" : "\n\n");
        output += block(child, 0, context);
      } else {
        inlineNodes.push(child);
      }
    }
    flushInline();
    return output;
  }

  function block(node, depth = 0, context) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue?.trim() ? inline(node) : "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${inline(node).trim()}\n\n`;
    if (["P", "FIGCAPTION"].includes(tag)) return `${inline(node).trim()}\n\n`;
    if (tag === "IMG") return `${inline(node)}\n\n`;
    if (tag === "HR") return "---\n\n";
    if (tag === "BLOCKQUOTE") {
      const value = blockChildren(node, context).trim();
      return value ? `${value.split("\n").map((line) => line ? `> ${line}` : ">").join("\n")}\n\n` : "";
    }
    if (tag === "PRE") {
      const marker = `${context.codePrefix}${context.codeBlocks.length}END`;
      context.codeBlocks.push({ marker, value: fencedCode(node) });
      return `${marker}\n\n`;
    }
    if (tag === "TABLE") return `${table(node)}\n\n`;
    if (["UL", "OL"].includes(tag)) {
      const rows = [...node.children].filter((item) => item.tagName === "LI").map((item, index) => {
        const value = blockChildren(item, context).trim();
        if (!value) return "";
        const marker = tag === "OL" ? `${index + 1}.` : "-";
        const indent = " ".repeat(marker.length + 1);
        const [first, ...rest] = value.split("\n");
        return [`${marker} ${first}`, ...rest.map((line) => line ? indent + line : "")].join("\n");
      }).filter(Boolean);
      return rows.length ? `${rows.join("\n")}\n\n` : "";
    }
    if (["ARTICLE", "ASIDE", "DIV", "FIGURE", "MAIN", "SECTION"].includes(tag)) {
      return `${blockChildren(node, context).trim()}\n\n`;
    }
    const children = [...node.childNodes].map((child) => block(child, depth, context)).join("");
    return children;
  }

  function toMarkdown(root) {
    let codePrefix = "CONTENTCATCHERCODE";
    const source = `${root.outerHTML}\n${root.textContent}`;
    while (source.includes(codePrefix)) codePrefix += "X";
    const context = { codePrefix, codeBlocks: [] };
    let markdown = [...root.childNodes].map((node) => block(node, 0, context)).join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    for (const { marker, value } of context.codeBlocks) {
      const index = markdown.indexOf(marker);
      if (index < 0) continue;
      const lineStart = markdown.lastIndexOf("\n", index) + 1;
      const prefix = markdown.slice(lineStart, index);
      const continuation = prefix.replace(/(^|[ \t>])([-+*]|\d+[.)])([ \t]+)/g, (_, before, listMarker, spacing) => before + " ".repeat(listMarker.length + spacing.length));
      const expanded = value.replace(/\n/g, () => `\n${continuation}`);
      markdown = markdown.slice(0, index) + expanded + markdown.slice(index + marker.length);
    }
    return markdown;
  }

  function visualHeadingLevel(node) {
    if (node.tagName !== "SECTION" || node.parentElement?.closest("p,li,ol,ul,pre,code,blockquote,table")) return 0;
    if ([...node.querySelectorAll("*")].some((child) => !["SPAN", "STRONG", "B", "EM", "I"].includes(child.tagName))) return 0;
    const marked = Number(node.getAttribute(DIAGNOSTIC_HEADING_LEVEL));
    if ([2, 3].includes(marked)) return marked;
    const value = normalized(node);
    if (!value || value.length > 90 || /[。！？.!?；;：:]$/.test(value)) return 0;
    const subheading = value.match(/^(\d{1,2}\.\d{1,2})(?![\d.])\s*(\S.*?)$/);
    const heading = subheading || value.match(/^(\d{1,2}\.)(?![\d.])\s*(\S.*?)$/);
    if (!heading) return 0;
    const children = [...node.childNodes].filter((child) => child.nodeType !== Node.TEXT_NODE || child.nodeValue.trim());
    const emphasized = children.length === 1 && ["STRONG", "B"].includes(children[0].tagName);
    const chapter = /^第[一二三四五六七八九十百千万零〇\d]+[章节篇]/.test(heading[2]);
    return emphasized || chapter ? subheading ? 3 : 2 : 0;
  }

  function promoteVisualHeadings(root) {
    [...root.querySelectorAll("section")].forEach((node) => {
      const level = visualHeadingLevel(node);
      if (!level) return;
      const heading = document.createElement(`h${level}`);
      if (node.id) heading.id = node.id;
      heading.textContent = normalized(node).replace(/^(\d{1,2}\.\d{1,2}|\d{1,2}\.)(?=\S)/, "$1 ");
      node.replaceWith(heading);
    });
  }

  try {
    const adapter = activeAdapter();
    const structured = jsonLd();
    const selection = findContentRoot();
    const rawContent = selection.node;
    const { content, stages } = clean(rawContent);
    const text = normalized(content);
    if (text.length < 120) return { ok: false, error: "页面正文太短，可能不是文章页面或内容尚未加载。" };
    const beforeMetrics = contentMetrics(rawContent);
    const afterMetrics = contentMetrics(content);
    const analysisReadiness = assessAnalysisReadiness(selection, beforeMetrics, afterMetrics);
    const title = meta(["#activity-name", ".rich_media_title", 'meta[property="og:title"]', 'meta[name="twitter:title"]', "h1"]) || structured.headline || document.title;
    const authorValue = structured.author;
    const structuredAuthor = Array.isArray(authorValue) ? authorValue.map((item) => item?.name || item).filter(Boolean).join(", ") : authorValue?.name || authorValue || "";
    const account = adapter?.account?.() || "";
    const author = adapter?.author?.() || meta(['[rel="author"]', '[itemprop="author"]', 'meta[name="author"]', 'meta[property="article:author"]']) || structuredAuthor || account;
    const publishedAt = meta(["#publish_time", 'meta[property="article:published_time"]', 'meta[name="date"]', "time[datetime]", "time"], "datetime") || structured.datePublished || "";
    const siteName = meta(['meta[property="og:site_name"]']) || location.hostname;
    const diagnostic = diagnosticSnapshot(rawContent, adapter, {
      selection,
      beforeMetrics,
      afterMetrics,
      cleanupStages: stages,
      analysisReadiness,
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
    adapter?.transform?.(content);
    let body = toMarkdown(content);
    body = body.replace(new RegExp(`^#\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
    const capturedAt = new Date().toISOString();
    const frontMatter = ["---", `title: ${JSON.stringify(title || "未命名文章")}`, author ? `author: ${JSON.stringify(author)}` : "", account && account !== author ? `account: ${JSON.stringify(account)}` : "", publishedAt ? `published: ${JSON.stringify(publishedAt)}` : "", `source: ${JSON.stringify(location.href)}`, `site: ${JSON.stringify(siteName)}`, `captured: ${JSON.stringify(capturedAt)}`, "---"].filter(Boolean).join("\n");
    return { ok: true, article: { title, author, account, publishedAt, siteName, url: location.href, text, markdown: `${frontMatter}\n\n# ${title || "未命名文章"}\n\n${body}\n`, characterCount: text.length, imageCount: content.querySelectorAll("img").length, capturedAt, analysisReadiness, diagnostic } };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
})();
