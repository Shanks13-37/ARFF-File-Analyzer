/**
 * Parse an ARFF document into an in-memory Dataset.
 *
 * This module deliberately has no Express, database, or filesystem dependencies.
 * It parses normal dense ARFF data and returns a partial dataset when possible,
 * together with all independent errors that it can identify.
 */

const ATTRIBUTE_TYPES = new Set(["numeric", "integer", "real", "string", "date"]);

function createError(code, line, section, message) {
  return { code, line, section, message };
}

function isDirective(line, name) {
  return new RegExp(`^@${name}\\b`, "i").test(line);
}

function readQuotedToken(source, start = 0) {
  const quote = source[start];
  if (quote !== "'" && quote !== '"') return null;

  let value = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      if (index + 1 >= source.length) return null;
      value += source[index + 1];
      index += 1;
    } else if (character === quote) {
      if (source[index + 1] === quote) {
        value += quote;
        index += 1;
      } else {
        return { value, next: index + 1 };
      }
    } else {
      value += character;
    }
  }
  return null;
}

function readToken(source, start = 0) {
  let index = start;
  while (/\s/.test(source[index] || "")) index += 1;
  if (index >= source.length) return null;

  const quoted = readQuotedToken(source, index);
  if (quoted) return { ...quoted, quoted: true };
  if (source[index] === "'" || source[index] === '"') return null;

  const begin = index;
  while (index < source.length && !/\s/.test(source[index])) index += 1;
  return { value: source.slice(begin, index), next: index, quoted: false };
}

function parseSingleValue(source) {
  const token = readToken(source);
  if (!token) return null;
  if (source.slice(token.next).trim()) return null;
  return token;
}

function parseNominalValues(source) {
  const values = [];
  let current = "";
  let quote = null;
  let wasQuoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") {
        if (index + 1 >= source.length) return null;
        current += source[index + 1];
        index += 1;
      } else if (character === quote) {
        if (source[index + 1] === quote) {
          current += quote;
          index += 1;
        } else {
          quote = null;
        }
      } else {
        current += character;
      }
    } else if (character === "'" || character === '"') {
      if (current.trim()) return null;
      quote = character;
      wasQuoted = true;
    } else if (character === ",") {
      const value = wasQuoted ? current : current.trim();
      if (!value) return null;
      values.push(value);
      current = "";
      wasQuoted = false;
    } else {
      if (wasQuoted && current && /\S/.test(character)) return null;
      current += character;
    }
  }

  if (quote) return null;
  const value = wasQuoted ? current : current.trim();
  if (!value) return null;
  values.push(value);
  return [...new Set(values)].length === values.length ? values : null;
}

function parseAttributeDeclaration(body) {
  const nameToken = readToken(body);
  if (!nameToken || !nameToken.value) return { error: "Attribute name is missing." };

  const typeSource = body.slice(nameToken.next).trim();
  if (!typeSource) return { error: "Attribute type is missing." };

  if (typeSource.startsWith("{")) {
    if (!typeSource.endsWith("}")) return { error: "Nominal attribute declaration is missing '}'." };
    const nominalValues = parseNominalValues(typeSource.slice(1, -1));
    if (!nominalValues) return { error: "Nominal attribute values are malformed." };
    return { name: nameToken.value, type: "nominal", nominalValues };
  }

  const typeToken = readToken(typeSource);
  if (!typeToken) return { error: "Attribute type is malformed." };
  const trailing = typeSource.slice(typeToken.next).trim();
  const type = typeToken.value.toLowerCase();
  if (!ATTRIBUTE_TYPES.has(type)) return { error: `Unsupported attribute type '${typeToken.value}'.` };
  if (type !== "date" && trailing) return { error: "Unexpected text after attribute type." };

  const attribute = { name: nameToken.value, type, nominalValues: [] };
  if (type === "date" && trailing) {
    const dateFormat = parseSingleValue(trailing);
    if (!dateFormat) return { error: "Date format is malformed." };
    attribute.dateFormat = dateFormat.value;
  }
  return attribute;
}

function parseDataRow(line) {
  const values = [];
  let current = "";
  let quote = null;
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === "\\") {
        if (index + 1 >= line.length) return null;
        current += line[index + 1];
        index += 1;
      } else if (character === quote) {
        if (line[index + 1] === quote) {
          current += quote;
          index += 1;
        } else {
          quote = null;
        }
      } else {
        current += character;
      }
    } else if (character === "'" || character === '"') {
      if (current.trim()) return null;
      quote = character;
      quoted = true;
    } else if (character === ",") {
      values.push({ value: quoted ? current : current.trim(), quoted });
      current = "";
      quoted = false;
    } else {
      if (quoted && /\S/.test(character)) return null;
      current += character;
    }
  }

  if (quote) return null;
  values.push({ value: quoted ? current : current.trim(), quoted });
  return values;
}

function emptyDataset() {
  return { relation: null, attributes: [], records: [] };
}

/**
 * @param {string|Buffer} content ARFF text or a UTF-8 buffer.
 * @returns {{valid: boolean, dataset: object, errors: Array<object>}}
 */
export function parseArff(content) {
  const dataset = emptyDataset();
  const errors = [];
  const attributeNames = new Set();
  const source = Buffer.isBuffer(content) ? content.toString("utf8") : String(content ?? "");
  const lines = source.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  let dataStarted = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineNumber = lineIndex + 1;
    const trimmed = lines[lineIndex].trim();
    if (!trimmed || trimmed.startsWith("%")) continue;

    if (isDirective(trimmed, "relation")) {
      if (dataStarted || dataset.relation !== null || dataset.attributes.length > 0) {
        errors.push(createError("INVALID_DECLARATION_ORDER", lineNumber, "header", "@relation must appear before @attribute and @data."));
        continue;
      }
      const relation = parseSingleValue(trimmed.replace(/^@relation\b/i, "").trim());
      if (!relation || !relation.value) {
        errors.push(createError("MALFORMED_RELATION", lineNumber, "header", "The @relation declaration is malformed."));
      } else {
        dataset.relation = relation.value;
      }
      continue;
    }

    if (isDirective(trimmed, "attribute")) {
      if (dataStarted) {
        errors.push(createError("INVALID_DECLARATION_ORDER", lineNumber, "header", "@attribute declarations cannot appear after @data."));
        continue;
      }
      if (dataset.relation === null) {
        errors.push(createError("INVALID_DECLARATION_ORDER", lineNumber, "header", "@attribute declarations require @relation first."));
        continue;
      }
      const parsed = parseAttributeDeclaration(trimmed.replace(/^@attribute\b/i, "").trim());
      if (parsed.error) {
        errors.push(createError("MALFORMED_ATTRIBUTE", lineNumber, "header", parsed.error));
        continue;
      }
      const normalizedName = parsed.name.toLowerCase();
      if (attributeNames.has(normalizedName)) {
        errors.push(createError("DUPLICATE_ATTRIBUTE", lineNumber, "header", `Attribute '${parsed.name}' is declared more than once.`));
        continue;
      }
      attributeNames.add(normalizedName);
      dataset.attributes.push({ index: dataset.attributes.length, ...parsed });
      continue;
    }

    if (isDirective(trimmed, "data")) {
      if (dataStarted) {
        errors.push(createError("INVALID_DECLARATION_ORDER", lineNumber, "header", "Only one @data declaration is allowed."));
      } else if (dataset.relation === null) {
        errors.push(createError("INVALID_DECLARATION_ORDER", lineNumber, "header", "@data requires @relation first."));
        dataStarted = true;
      } else if (dataset.attributes.length === 0) {
        errors.push(createError("INVALID_DECLARATION_ORDER", lineNumber, "header", "@data requires at least one @attribute declaration."));
        dataStarted = true;
      } else if (trimmed.replace(/^@data\b/i, "").trim()) {
        errors.push(createError("MALFORMED_DATA_DECLARATION", lineNumber, "header", "The @data declaration must not contain trailing text."));
        dataStarted = true;
      } else {
        dataStarted = true;
      }
      continue;
    }

    if (!dataStarted) {
      errors.push(createError("UNEXPECTED_CONTENT", lineNumber, "header", "Only @relation, @attribute, and @data declarations are allowed before @data."));
      continue;
    }

    const values = parseDataRow(trimmed);
    if (!values) {
      errors.push(createError("MALFORMED_DATA", lineNumber, "data", "The data row contains malformed quoting or delimiters."));
      continue;
    }
    if (values.length !== dataset.attributes.length) {
      errors.push(createError(
        "WRONG_FIELD_COUNT",
        lineNumber,
        "data",
        `The data row contains ${values.length} field(s); expected ${dataset.attributes.length}.`
      ));
      continue;
    }
    dataset.records.push({
      index: dataset.records.length,
      values: values.map((entry) => (!entry.quoted && entry.value === "?" ? null : entry.value)),
      sourceLine: lineNumber
    });
  }

  if (dataset.relation === null) {
    errors.push(createError("MISSING_RELATION", 1, "header", "The ARFF file is missing an @relation declaration."));
  }
  if (!dataStarted) {
    errors.push(createError("MISSING_DATA", lines.length, "header", "The ARFF file is missing a @data declaration."));
  }

  return { valid: errors.length === 0, dataset, errors };
}

export default parseArff;
