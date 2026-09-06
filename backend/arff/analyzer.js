/**
 * Analyze a parsed ARFF Dataset.
 *
 * This module only consumes the parser's in-memory representation. It does not
 * read files, parse source text, or depend on Express, React, or a database.
 */

const NUMERIC_TYPES = new Set(["numeric", "integer", "real"]);

function isMissing(value) {
  return value === null || value === undefined || value === "?";
}

function isValidNumeric(value, type) {
  const text = String(value).trim();
  if (!text || !Number.isFinite(Number(text))) return false;
  return type !== "integer" || /^[+-]?\d+$/.test(text);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateDateParts(value, format) {
  const tokens = [];
  let pattern = "";
  let index = 0;
  const tokenPattern = /yyyy|yy|MM|M|dd|d|HH|H|mm|m|ss|s/g;
  let match;

  while ((match = tokenPattern.exec(format))) {
    pattern += escapeRegex(format.slice(index, match.index));
    const token = match[0];
    tokens.push(token);
    pattern += token.length === 1 ? "(\\d{1,2})" : "(\\d{" + token.length + "})";
    index = match.index + token.length;
  }
  pattern += escapeRegex(format.slice(index));

  const result = new RegExp(`^${pattern}$`).exec(value);
  if (!result) return false;

  const parts = { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  let capture = 1;
  for (const token of tokens) {
    const number = Number(result[capture]);
    capture += 1;
    if (token === "yyyy") parts.year = number;
    if (token === "yy") parts.year = 2000 + number;
    if (token === "MM" || token === "M") parts.month = number;
    if (token === "dd" || token === "d") parts.day = number;
    if (token === "HH" || token === "H") parts.hour = number;
    if (token === "mm" || token === "m") parts.minute = number;
    if (token === "ss" || token === "s") parts.second = number;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day &&
    date.getUTCHours() === parts.hour &&
    date.getUTCMinutes() === parts.minute &&
    date.getUTCSeconds() === parts.second
  );
}

function isValidDate(value, format) {
  const text = String(value).trim();
  if (!text) return false;
  if (format) return validateDateParts(text, format);
  return !Number.isNaN(Date.parse(text));
}

function validateValue(value, attribute) {
  const type = String(attribute.type || "").toLowerCase();
  if (NUMERIC_TYPES.has(type)) return isValidNumeric(value, type);
  if (type === "nominal") return Array.isArray(attribute.nominalValues) && attribute.nominalValues.includes(value);
  if (type === "string") return true;
  if (type === "date") return isValidDate(value, attribute.dateFormat);
  return false;
}

function typeViolation(record, attribute, value, type) {
  let code = "INVALID_ATTRIBUTE_VALUE";
  if (NUMERIC_TYPES.has(type)) code = "INVALID_NUMERIC_VALUE";
  if (type === "nominal") code = "INVALID_NOMINAL_VALUE";
  if (type === "date") code = "INVALID_DATE_VALUE";

  return {
    code,
    recordIndex: record.index,
    attributeIndex: attribute.index,
    attributeName: attribute.name,
    value,
    sourceLine: record.sourceLine,
    message: `Invalid ${type || "attribute"} value '${String(value)}' for attribute '${attribute.name}'.`
  };
}

function duplicateKey(values) {
  return JSON.stringify(values.map((value) => (value === undefined ? null : value)));
}

/**
 * Analyze a parsed Dataset without re-reading or re-parsing the raw ARFF text.
 *
 * @param {{relation: string|null, attributes: Array<object>, records: Array<object>}} dataset
 * @returns {object} A JSON-serializable AnalysisResult.
 */
export function analyzeDataset(dataset) {
  const attributes = Array.isArray(dataset?.attributes) ? dataset.attributes : [];
  const records = Array.isArray(dataset?.records) ? dataset.records : [];
  const attributeResults = attributes.map((attribute, index) => ({
    index: attribute.index ?? index,
    name: attribute.name,
    type: String(attribute.type || "").toLowerCase(),
    ...(attribute.dateFormat ? { dateFormat: attribute.dateFormat } : {}),
    nominalValues: Array.isArray(attribute.nominalValues) ? [...attribute.nominalValues] : [],
    missingCount: 0,
    validValueCount: 0
  }));
  const typeViolations = [];
  const missingByAttribute = attributes.map((attribute, index) => ({
    index: attribute.index ?? index,
    name: attribute.name,
    count: 0
  }));
  const seenRecords = new Map();
  const duplicateGroups = [];
  let missingValueCount = 0;

  for (const [recordPosition, record] of records.entries()) {
    const values = Array.isArray(record?.values) ? record.values : [];
    const recordForErrors = { ...record, index: record?.index ?? recordPosition };
    const normalizedValues = attributes.map((_attribute, index) => values[index] ?? null);

    for (let attributeIndex = 0; attributeIndex < attributes.length; attributeIndex += 1) {
      const attribute = attributes[attributeIndex];
      const value = values[attributeIndex];
      if (isMissing(value)) {
        missingValueCount += 1;
        missingByAttribute[attributeIndex].count += 1;
        attributeResults[attributeIndex].missingCount += 1;
        continue;
      }

      if (validateValue(value, attribute)) {
        attributeResults[attributeIndex].validValueCount += 1;
      } else {
        typeViolations.push(typeViolation(recordForErrors, attribute, value, String(attribute.type || "").toLowerCase()));
      }
    }

    const key = duplicateKey(normalizedValues);
    const existing = seenRecords.get(key);
    if (existing) {
      existing.recordIndices.push(recordForErrors.index);
      existing.duplicateRecordCount += 1;
    } else {
      const group = {
        recordIndices: [recordForErrors.index],
        duplicateRecordCount: 0,
        values: normalizedValues
      };
      seenRecords.set(key, group);
      duplicateGroups.push(group);
    }
  }

  const duplicates = duplicateGroups.filter((group) => group.duplicateRecordCount > 0);
  const duplicateRecordCount = duplicates.reduce((total, group) => total + group.duplicateRecordCount, 0);
  const attributeTypeCounts = { numeric: 0, nominal: 0, string: 0, date: 0 };
  for (const attribute of attributes) {
    const type = String(attribute.type || "").toLowerCase();
    if (NUMERIC_TYPES.has(type)) attributeTypeCounts.numeric += 1;
    else if (type in attributeTypeCounts) attributeTypeCounts[type] += 1;
  }

  return {
    summary: {
      instanceCount: records.length,
      attributeCount: attributes.length,
      missingValueCount,
      duplicateRecordCount
    },
    attributeTypeCounts,
    attributes: attributeResults,
    typeViolations,
    missingValues: {
      total: missingValueCount,
      byAttribute: missingByAttribute
    },
    duplicates,
    valid: typeViolations.length === 0
  };
}

export default analyzeDataset;
