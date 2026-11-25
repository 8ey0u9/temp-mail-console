import PostalMime from "postal-mime";

export const MAX_TEXT_PREVIEW_LENGTH = 16000;
export const MAX_RAW_CONTENT_LENGTH = 262144;
export const MAX_REGEX_LENGTH = 500;
export const VALID_MATCH_TARGETS = new Set(["body", "subject", "both", "html"]);

const NAMED_ENTITIES = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'"
};

export function normalizeEmailAddress(address) {
  return String(address || "").trim().toLowerCase();
}

export function extractUniqueAddresses(list) {
  const seen = new Set();
  const output = [];
  for (const item of list) {
    const normalized = normalizeEmailAddress(item);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      output.push(normalized);
    }
  }
  return output;
}

export function stripHtmlToText(html) {
  if (!html) return "";
  let text = String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6]|section|article|blockquote)\s*>/gi, "\n")
    .replace(/<\/\s*(td|th)\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  text = text.replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    const lower = entity.toLowerCase();
    if (NAMED_ENTITIES[lower]) return NAMED_ENTITIES[lower];
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return " ";
  });

  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function pickPreviewText(text, htmlText) {
  const cleanText = String(text || "").replace(/\r\n?/g, "\n").trim();
  const cleanHtmlText = String(htmlText || "").trim();

  let chosen = cleanText;
  if (!cleanText) {
    chosen = cleanHtmlText;
  } else if (
    cleanHtmlText &&
    (/please\s+(?:view|open|enable|use).*html/i.test(cleanText) ||
      (cleanText.length < 150 && cleanHtmlText.length >= cleanText.length))
  ) {
    chosen = cleanHtmlText;
  }

  if (chosen.length > MAX_TEXT_PREVIEW_LENGTH) {
    return chosen.slice(0, MAX_TEXT_PREVIEW_LENGTH) + "\n...[truncated]";
  }
  return chosen;
}

export function validateRegexPattern(
  pattern,
  { label = "正则表达式", field = "pattern" } = {}
) {
  const value = String(pattern || "").trim();
  if (!value) {
    return {
      ok: false,
      error: `${label}不能为空`,
      errorCode: field === "sender_pattern" ? "WHITELIST_PATTERN_REQUIRED" : field === "sender_filter" ? "SENDER_FILTER_REQUIRED" : "PATTERN_REQUIRED"
    };
  }
  if (value.length > MAX_REGEX_LENGTH) {
    return {
      ok: false,
      error: `${label}长度不能超过 ${MAX_REGEX_LENGTH} 字符`,
      errorCode: "REGEX_TOO_LONG",
      errorMeta: { max: MAX_REGEX_LENGTH }
    };
  }
  try {
    new RegExp(value);
    return { ok: true, value };
  } catch (err) {
    const detail = err?.message || "invalid regex";
    return {
      ok: false,
      error: `${label}语法错误: ${detail}`,
      errorCode: field === "sender_filter" ? "INVALID_SENDER_FILTER" : "INVALID_REGEX",
      errorMeta: { detail }
    };
  }
}

export function validateSenderFilter(senderFilter) {
  const raw = String(senderFilter || "").trim();
  if (!raw) return { ok: true, value: "" };
  const parts = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const check = validateRegexPattern(part, { label: "发信人过滤规则", field: "sender_filter" });
    if (!check.ok) return check;
  }
  return { ok: true, value: raw };
}

export function senderMatches(senderValue, filterValue) {
  const filter = String(filterValue || "").trim();
  if (!filter) return true;
  const parts = filter.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return true;
  return parts.some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(senderValue);
    } catch {
      return false;
    }
  });
}

export function senderInWhitelist(sender, whitelist) {
  const activePatterns = (whitelist || []).filter((item) => item.enabled !== false && item.enabled !== 0);
  if (activePatterns.length === 0) return true;
  const senderValue = normalizeEmailAddress(sender);
  return activePatterns.some(({ sender_pattern }) => {
    try {
      return new RegExp(sender_pattern, "i").test(senderValue);
    } catch {
      return false;
    }
  });
}

export function extractRuleValue(content, regex) {
  const match = String(content || "").match(regex);
  if (!match) return null;
  if (match.length > 1) {
    const captured = match.slice(1).find((group) => group !== undefined && group !== "");
    if (captured !== undefined) return captured;
  }
  return match[0] || null;
}

export function applyRules(mailContent, sender, rules) {
  const senderValue = normalizeEmailAddress(sender);
  const sliceContent = (val) => {
    const str = String(val || "");
    return str.length > MAX_RAW_CONTENT_LENGTH ? str.slice(0, MAX_RAW_CONTENT_LENGTH) : str;
  };
  const subject = typeof mailContent === "string" ? "" : String(mailContent?.subject || "");
  const text = typeof mailContent === "string" ? sliceContent(mailContent) : sliceContent(mailContent?.text);
  const html = typeof mailContent === "string" ? "" : sliceContent(mailContent?.html);
  const htmlText = typeof mailContent === "string" ? "" : sliceContent(mailContent?.htmlText);

  const outputs = [];
  for (const rule of rules || []) {
    if (rule.enabled === false || rule.enabled === 0) continue;
    if (!senderMatches(senderValue, rule.sender_filter)) continue;

    let regex;
    try {
      regex = new RegExp(rule.pattern, "m");
    } catch {
      continue;
    }

    const targetMode = VALID_MATCH_TARGETS.has(rule.match_target) ? rule.match_target : "body";
    const candidates = [];
    if (targetMode === "subject") {
      if (subject) candidates.push(subject);
    } else if (targetMode === "html") {
      if (html) candidates.push(html);
    } else if (targetMode === "both") {
      if (subject) candidates.push(subject);
      if (text) candidates.push(text);
      if (htmlText && htmlText !== text) candidates.push(htmlText);
    } else {
      if (text) candidates.push(text);
      if (htmlText && htmlText !== text) candidates.push(htmlText);
    }

    for (const candidate of candidates) {
      const value = extractRuleValue(candidate, regex);
      if (value) {
        outputs.push({ rule_id: rule.id ?? null, value, remark: rule.remark || null });
        break;
      }
    }
  }
  return outputs;
}

export async function parseIncomingEmail(message) {
  const rawBuffer = await new Response(message.raw).arrayBuffer();
  const parsed = await new PostalMime().parse(rawBuffer);

  const headerToList = Array.isArray(parsed.to) ? parsed.to.map((item) => item?.address) : [];
  const envelopeToList = Array.isArray(message.to) ? message.to : [message.to];
  const to = extractUniqueAddresses([...headerToList, ...envelopeToList]);

  const from = normalizeEmailAddress(parsed.from?.address || message.from || "");
  const subject = String(parsed.subject || "").trim();
  const rawText = String(parsed.text || "");
  const text = rawText.trim();
  const html = String(parsed.html || "");
  const htmlText = stripHtmlToText(html);
  const textPreview = pickPreviewText(text, htmlText);

  const rawSize = rawBuffer.byteLength;
  const rawTruncated = rawSize > MAX_RAW_CONTENT_LENGTH;
  const rawSlice = rawTruncated ? rawBuffer.slice(0, MAX_RAW_CONTENT_LENGTH) : rawBuffer;
  const rawEml = new TextDecoder("utf-8", { fatal: false }).decode(rawSlice);

  const textBody = rawText.length > MAX_RAW_CONTENT_LENGTH ? rawText.slice(0, MAX_RAW_CONTENT_LENGTH) : rawText;
  const htmlBody = html.length > MAX_RAW_CONTENT_LENGTH ? html.slice(0, MAX_RAW_CONTENT_LENGTH) : html;
  const truncated =
    rawTruncated || rawText.length > MAX_RAW_CONTENT_LENGTH || html.length > MAX_RAW_CONTENT_LENGTH;

  return {
    from,
    to,
    subject,
    text,
    html,
    htmlText,
    textPreview,
    textBody,
    htmlBody,
    rawEml,
    rawSize,
    truncated
  };
}

const SIMPLE_EMAIL_RE = /^[^\s@<>,"'`;:\\/()[\]]+@[^\s@<>,"'`;:\\/()[\]]+\.[^\s@<>,"'`;:\\/()[\]]+$/;

export function validateForwardEmail(email, { required = false } = {}) {
  const value = String(email || "").trim().toLowerCase();
  if (!value) {
    if (required) {
      return { ok: false, error: "启用转发时必须填写目标邮箱", errorCode: "FORWARD_EMAIL_REQUIRED" };
    }
    return { ok: true, value: "" };
  }
  if (value.length > 254 || !SIMPLE_EMAIL_RE.test(value)) {
    return { ok: false, error: "转发邮箱格式不正确", errorCode: "INVALID_FORWARD_EMAIL" };
  }
  return { ok: true, value };
}
