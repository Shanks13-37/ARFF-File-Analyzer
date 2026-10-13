const NUMERIC_TYPES = new Set(["numeric", "integer", "real"]);

export function isMissing(value, quoted = false) {
  return value === null || value === undefined || (value === "?" && !quoted);
}

export function isNumericType(type) {
  return NUMERIC_TYPES.has(String(type || "").toLowerCase());
}

export function isValidNumeric(value, type) {
  const text = String(value).trim();
  if (!text || !Number.isFinite(Number(text))) return false;
  return String(type).toLowerCase() !== "integer" || /^[+-]?\d+$/.test(text);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseDateValue(value, format) {
  const text = String(value).trim();
  if (!text) return { valid: false, timestamp: null, reason: "empty" };
  if (!format) {
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? { valid: true, timestamp, method: "javascript-date-parse" } : { valid: false, timestamp: null, reason: "unparseable" };
  }
  const tokens = [];
  let pattern = "";
  let index = 0;
  const tokenPattern = /yyyy|yy|MM|M|dd|d|HH|H|mm|m|ss|s/g;
  let match;
  while ((match = tokenPattern.exec(format))) {
    pattern += escapeRegex(format.slice(index, match.index));
    const token = match[0];
    tokens.push(token);
    pattern += token.length === 1 ? "(\\d{1,2})" : `(\\d{${token.length}})`;
    index = match.index + token.length;
  }
  pattern += escapeRegex(format.slice(index));
  const supportedTokens = new Set(["yyyy", "yy", "MM", "M", "dd", "d", "HH", "H", "mm", "m", "ss", "s"]);
  const tokenRuns = format.match(/([yMdHms])\1*/g) || [];
  if (tokens.length === 0 || /[A-Za-z]/.test(format.replace(tokenPattern, "")) || tokenRuns.some((token) => !supportedTokens.has(token))) {
    return { valid: false, timestamp: null, reason: "unsupported-format" };
  }
  const result = new RegExp(`^${pattern}$`).exec(text);
  if (!result) return { valid: false, timestamp: null, reason: "format-mismatch" };
  const parts = { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  let capture = 1;
  for (const token of tokens) {
    const number = Number(result[capture++]);
    if (token === "yyyy") parts.year = number;
    if (token === "yy") parts.year = 2000 + number;
    if (token === "MM" || token === "M") parts.month = number;
    if (token === "dd" || token === "d") parts.day = number;
    if (token === "HH" || token === "H") parts.hour = number;
    if (token === "mm" || token === "m") parts.minute = number;
    if (token === "ss" || token === "s") parts.second = number;
  }
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  const valid = date.getUTCFullYear() === parts.year && date.getUTCMonth() === parts.month - 1 && date.getUTCDate() === parts.day && date.getUTCHours() === parts.hour && date.getUTCMinutes() === parts.minute && date.getUTCSeconds() === parts.second;
  return valid ? { valid: true, timestamp: date.getTime(), method: "declared-format" } : { valid: false, timestamp: null, reason: "invalid-date-parts" };
}

export function isValidDate(value, format) { return parseDateValue(value, format).valid; }

export function validateValue(value, attribute) {
  const type = String(attribute.type || "").toLowerCase();
  if (isNumericType(type)) return isValidNumeric(value, type);
  if (type === "nominal") return Array.isArray(attribute.nominalValues) && attribute.nominalValues.includes(value);
  if (type === "string") return true;
  if (type === "date") return isValidDate(value, attribute.dateFormat);
  return false;
}
