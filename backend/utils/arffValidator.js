const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["NUMERIC", "REAL", "INTEGER", "STRING", "DATE"]);

function error(message) {
  return { valid: false, errors: [message] };
}

function parseQuotedToken(source) {
  const quote = source[0];
  if (quote !== "'" && quote !== '"') return null;

  let value = "";
  for (let index = 1; index < source.length; index += 1) {
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
        return { value, rest: source.slice(index + 1).trim() };
      }
    } else {
      value += character;
    }
  }
  return null;
}

function parseName(source) {
  const value = source.trim();
  if (!value) return null;
  const quoted = parseQuotedToken(value);
  if (quoted) return quoted.value ? quoted : null;

  const match = value.match(/^([^\s,{}]+)(?:\s+(.*))?$/);
  if (!match || match[1].startsWith("@")) return null;
  return { value: match[1], rest: (match[2] || "").trim() };
}

function parseCsv(source) {
  const values = [];
  let value = "";
  let quoted = false;
  let quote = null;
  let closedQuote = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") {
        if (index + 1 >= source.length) return null;
        value += source[index + 1];
        index += 1;
      } else if (character === quote) {
        if (source[index + 1] === quote) {
          value += quote;
          index += 1;
        } else {
          quote = null;
          closedQuote = true;
        }
      } else {
        value += character;
      }
    } else if (character === "'" || character === '"') {
      if (value.trim() || closedQuote) return null;
      quote = character;
      quoted = true;
    } else if (character === ",") {
      values.push({ value: value.trim(), quoted });
      value = "";
      quoted = false;
      closedQuote = false;
    } else {
      if (closedQuote && !/\s/.test(character)) return null;
      value += character;
    }
  }

  if (quote) return null;
  values.push({ value: value.trim(), quoted });
  return values;
}

function parseAttribute(line) {
  const body = line.replace(/^@attribute\b/i, "").trim();
  const name = parseName(body);
  if (!name || !name.rest) return null;

  const typeSource = name.rest.trim();
  if (typeSource.startsWith("{")) {
    if (!typeSource.endsWith("}")) return { invalidType: typeSource };
    const values = parseCsv(typeSource.slice(1, -1));
    if (!values || values.length === 0 || values.some((entry) => !entry.value)) return { invalidType: typeSource };

    const nominalValues = new Set();
    for (const entry of values) {
      if (nominalValues.has(entry.value)) return { invalidType: typeSource };
      nominalValues.add(entry.value);
    }
    return { name: name.value, type: "NOMINAL", nominalValues };
  }

  const typeMatch = typeSource.match(/^([A-Za-z]+)(?:\s+(['"]).*\2)?$/);
  if (!typeMatch) return { invalidType: typeSource };
  const type = typeMatch[1].toUpperCase();
  if (!SUPPORTED_TYPES.has(type) || (type !== "DATE" && typeMatch[2])) return { invalidType: typeSource };
  return { name: name.value, type };
}

function isValidDate(value) {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

function validateValue(value, attribute, rowNumber) {
  if (!value.quoted && value.value === "?") return null;
  const displayedValue = value.value;

  if (attribute.type === "NUMERIC" || attribute.type === "REAL") {
    if (!displayedValue || !Number.isFinite(Number(displayedValue))) {
      return `Invalid numeric value '${displayedValue}' for attribute '${attribute.name}' on data row ${rowNumber}.`;
    }
  } else if (attribute.type === "INTEGER") {
    if (!/^[+-]?\d+$/.test(displayedValue)) {
      return `Invalid numeric value '${displayedValue}' for attribute '${attribute.name}' on data row ${rowNumber}.`;
    }
  } else if (attribute.type === "NOMINAL" && !attribute.nominalValues.has(displayedValue)) {
    return `Invalid nominal value '${displayedValue}' for attribute '${attribute.name}' on data row ${rowNumber}.`;
  } else if (attribute.type === "DATE" && !isValidDate(displayedValue)) {
    return `Invalid date value '${displayedValue}' for attribute '${attribute.name}' on data row ${rowNumber}.`;
  }
  return null;
}

/** Validates an uploaded ARFF file without throwing for malformed input. */
export function validateArffFile(file) {
  try {
    if (!file || !Buffer.isBuffer(file.buffer)) return error("File could not be read.");
    if (!file.originalname?.toLowerCase().endsWith(".arff")) {
      return error("Only files with the .arff extension are accepted.");
    }
    if (file.size > MAX_FILE_SIZE || file.buffer.length > MAX_FILE_SIZE) {
      return error("File is too large. Maximum allowed size is 10 MB.");
    }

    const lines = file.buffer
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .split(/\r\n|\n|\r/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("%"));

    if (lines.length === 0) return error("File is empty.");

    let relationSeen = false;
    let dataSeen = false;
    let dataRows = 0;
    const attributes = [];
    const attributeNames = new Set();

    for (const line of lines) {
      if (/^@relation\b/i.test(line)) {
        if (relationSeen) return error("Duplicate @RELATION declaration.");
        if (dataSeen || attributes.length > 0) return error("Invalid @RELATION declaration.");
        const relation = parseName(line.replace(/^@relation\b/i, ""));
        if (!relation || relation.rest) return error("Invalid @RELATION declaration.");
        relationSeen = true;
        continue;
      }

      if (/^@attribute\b/i.test(line)) {
        if (!relationSeen || dataSeen) return error("Invalid @ATTRIBUTE declaration.");
        const attribute = parseAttribute(line);
        if (!attribute || attribute.invalidType) {
          return error(attribute?.invalidType ? `Unsupported attribute type: ${attribute.invalidType}.` : "Invalid @ATTRIBUTE declaration.");
        }
        const normalizedName = attribute.name.toLowerCase();
        if (attributeNames.has(normalizedName)) return error(`Duplicate attribute name: ${attribute.name}.`);
        attributeNames.add(normalizedName);
        attributes.push(attribute);
        continue;
      }

      if (/^@data\b/i.test(line)) {
        if (dataSeen) return error("Duplicate @DATA declaration.");
        if (!relationSeen) return error("Missing @RELATION declaration.");
        if (attributes.length === 0) return error("Missing @ATTRIBUTE declaration.");
        if (line.replace(/^@data\b/i, "").trim()) return error("Missing @DATA section.");
        dataSeen = true;
        continue;
      }

      if (!relationSeen) return error("Missing @RELATION declaration.");
      if (!dataSeen) {
        if (attributes.length === 0) return error("Missing @ATTRIBUTE declaration.");
        return error("Missing @DATA section.");
      }

      dataRows += 1;
      const values = parseCsv(line);
      if (!values) return error(`Data row ${dataRows} has invalid quoted values.`);
      if (values.length !== attributes.length) {
        return error(`Data row ${dataRows} has ${values.length} values; expected ${attributes.length}.`);
      }
      for (let index = 0; index < values.length; index += 1) {
        const validationError = validateValue(values[index], attributes[index], dataRows);
        if (validationError) return error(validationError);
      }
    }

    if (!relationSeen) return error("Missing @RELATION declaration.");
    if (attributes.length === 0) return error("Missing @ATTRIBUTE declaration.");
    if (!dataSeen) return error("Missing @DATA section.");
    if (dataRows === 0) return error("Missing data rows after @DATA.");
    return { valid: true, errors: [] };
  } catch {
    return error("Invalid ARFF file.");
  }
}
