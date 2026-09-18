const ATX_HEADING = /^ {0,3}#{1,6}(?:[\t ]|$)/;
const SETEXT_HEADING = /^ {0,3}(?:=+|-+)[\t ]*$/;
const LIST_ITEM = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[\t ]|$)/;
const QUOTE = /^ {0,3}>/;
const IMAGE = /^\s*!\[[^\]\r\n]*\](?:\([^\r\n]*\)|\[[^\]\r\n]*\])\s*$/;

function sourceLines(markdown) {
  const lines = [];
  let start = 0;
  for (const match of markdown.matchAll(/\r\n|\r|\n/g)) {
    lines.push({ text: markdown.slice(start, match.index), start, end: match.index });
    start = match.index + match[0].length;
  }
  lines.push({ text: markdown.slice(start), start, end: markdown.length });
  return lines;
}

function openingFence(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1][0] === "`" && match[2].includes("`"))) return null;
  return { character: match[1][0], length: match[1].length };
}

function closesFence(line, fence) {
  const match = /^ {0,3}(`+|~+)[\t ]*$/.exec(line);
  return Boolean(match && match[1][0] === fence.character && match[1].length >= fence.length);
}

function containerFence(line) {
  let offset = 0;
  while (offset < line.length) {
    const whitespace = /^[\t ]*/.exec(line.slice(offset))[0];
    offset += whitespace.length;
    const marker = /^(?:>[\t ]?|(?:[-+*]|\d{1,9}[.)])[\t ]+)/.exec(line.slice(offset));
    if (!marker) break;
    offset += marker[0].length;
  }
  const fence = openingFence(line.slice(offset));
  if (!fence) return null;
  // Match the exact structural prefix on subsequent lines. A literal ">"
  // inside code must not be mistaken for another quote container.
  const continuation = line.slice(0, offset).replace(
    /(^|[\t >])([-+*]|\d+[.)])([\t ]+)/g,
    (_, before, marker, spacing) => before + " ".repeat(marker.length + spacing.length)
  );
  return { ...fence, continuation };
}

function containerEnd(lines, start, type) {
  const listPrefix = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[\t ]+|$)/.exec(lines[start].text)?.[0];
  const minimumIndent = listPrefix?.length || 0;
  const indented = (line) => /^[\t ]*/.exec(line)[0].length >= minimumIndent;
  const belongs = (line) => type === "quote" ? QUOTE.test(line) : LIST_ITEM.test(line) || indented(line);
  let cursor = start;
  let fence = null;
  let hadCode = false;
  while (cursor < lines.length) {
    const line = lines[cursor].text;
    if (fence) {
      if (line.startsWith(fence.continuation) && closesFence(line.slice(fence.continuation.length), fence)) fence = null;
      cursor += 1;
      continue;
    }
    if (!line.trim()) {
      let next = cursor + 1;
      while (next < lines.length && !lines[next].text.trim()) next += 1;
      // Preserve ordinary blank-separated blocks. Only bridge list continuations
      // when they introduce or follow code within this list.
      if (type !== "list" || next === lines.length || !indented(lines[next].text)
        || !(hadCode || containerFence(lines[next].text))) break;
      cursor = next;
      continue;
    }
    const member = belongs(line);
    if (cursor > start && (ATX_HEADING.test(line) || (!member && openingFence(line)))) break;
    const opening = member ? containerFence(line) : null;
    if (opening) {
      fence = opening;
      hadCode = true;
    }
    cursor += 1;
  }
  return cursor;
}

function frontmatterEnd(lines) {
  if (!/^\uFEFF?---[\t ]*$/.test(lines[0].text)) return 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (/^(?:---|\.\.\.)[\t ]*$/.test(lines[index].text)) return index + 1;
  }
  return 0;
}

function isTableDivider(line) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|");
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function blockType(lines, start, end) {
  const first = lines[start].text;
  if (LIST_ITEM.test(first)) return "list";
  if (QUOTE.test(first)) return "quote";
  if (end > start && first.includes("|") && isTableDivider(lines[start + 1].text)) return "table";
  if (lines.slice(start, end + 1).every((line) => IMAGE.test(line.text))) return "image";
  return "paragraph";
}

/** Build a deterministic, read-only lookup into the original Markdown. */
export function buildEvidenceIndex(markdown) {
  if (typeof markdown !== "string" || !markdown.trim()) return [];
  const lines = sourceLines(markdown);
  const blocks = [];
  const append = (start, end, type) => {
    const text = markdown.slice(lines[start].start, lines[end].end).trim();
    blocks.push({
      id: `B${String(blocks.length + 1).padStart(4, "0")}`,
      type,
      startLine: start + 1,
      endLine: end + 1,
      excerpt: Array.from(text).slice(0, 48).join("")
    });
  };

  let cursor = frontmatterEnd(lines);
  while (cursor < lines.length) {
    if (!lines[cursor].text.trim()) {
      cursor += 1;
      continue;
    }
    const start = cursor;
    const fence = openingFence(lines[cursor].text);
    if (fence) {
      cursor += 1;
      while (cursor < lines.length && !closesFence(lines[cursor].text, fence)) cursor += 1;
      const end = cursor < lines.length ? cursor : lines.length - 1;
      append(start, end, "code");
      cursor = end + 1;
      continue;
    }
    if (ATX_HEADING.test(lines[cursor].text)) {
      append(cursor, cursor, "heading");
      cursor += 1;
      continue;
    }
    const containerType = LIST_ITEM.test(lines[cursor].text) ? "list" : QUOTE.test(lines[cursor].text) ? "quote" : null;
    if (containerType) {
      cursor = containerEnd(lines, start, containerType);
      append(start, cursor - 1, containerType);
      continue;
    }

    cursor += 1;
    let type;
    while (cursor < lines.length && lines[cursor].text.trim()) {
      if (ATX_HEADING.test(lines[cursor].text) || openingFence(lines[cursor].text)) break;
      if (SETEXT_HEADING.test(lines[cursor].text) && blockType(lines, start, cursor - 1) === "paragraph") {
        type = "heading";
        cursor += 1;
        break;
      }
      cursor += 1;
    }
    append(start, cursor - 1, type || blockType(lines, start, cursor - 1));
  }
  return blocks;
}
