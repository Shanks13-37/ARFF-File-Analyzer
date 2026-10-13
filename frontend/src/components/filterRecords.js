import { isValidNumeric } from "../../../backend/arff/valueValidation.js";

const NUMERIC_TYPES = new Set(["numeric", "integer", "real"]);

function isMissing(record, index) {
  const value = record?.values?.[index];
  return value === null || value === undefined || (value === "?" && record?.quotedValues?.[index] !== true);
}

function parseNumber(value, label) {
  const number = Number(String(value).trim());
  if (String(value).trim() === "" || !Number.isFinite(number)) {
    return { error: `${label} must be a valid number.` };
  }
  return { value: number };
}

/**
 * Filter records without changing the source records or their indices.
 * Returns { records, error } so invalid numeric criteria can be displayed.
 */
export function filterRecords(records = [], attribute, criteria = {}) {
  const sourceRecords = Array.isArray(records) ? records : [];
  if (!attribute) return { records: [...sourceRecords], error: null };

  const attributeIndex = Number.isInteger(attribute.index) ? attribute.index : 0;
  const type = String(attribute.type || "").toLowerCase();
  const mode = criteria.mode || "exact";
  const rawValue = criteria.value ?? "";

  if (NUMERIC_TYPES.has(type)) {
    if (mode === "exact") {
      if (String(rawValue).trim() === "") return { records: [...sourceRecords], error: null };
      const parsed = parseNumber(rawValue, "Exact value");
      if (parsed.error) return { records: [], error: parsed.error };
      return {
        records: sourceRecords.filter((record) => {
          const value = record?.values?.[attributeIndex];
          return !isMissing(record, attributeIndex) && isValidNumeric(value, type) && Number(String(value).trim()) === parsed.value;
        }),
        error: null
      };
    }

    const minText = String(criteria.min ?? "").trim();
    const maxText = String(criteria.max ?? "").trim();
    if (!minText && !maxText) return { records: [...sourceRecords], error: null };
    const min = minText ? parseNumber(minText, "Minimum") : { value: null };
    const max = maxText ? parseNumber(maxText, "Maximum") : { value: null };
    if (min.error || max.error) return { records: [], error: min.error || max.error };
    if (min.value !== null && max.value !== null && min.value > max.value) {
      return { records: [], error: "Minimum cannot be greater than maximum." };
    }
    return {
      records: sourceRecords.filter((record) => {
        const value = record.values?.[attributeIndex];
        if (isMissing(record, attributeIndex)) return false;
        if (!isValidNumeric(value, type)) return false;
        const number = Number(String(value).trim());
        return Number.isFinite(number) &&
          (min.value === null || number >= min.value) &&
          (max.value === null || number <= max.value);
      }),
      error: null
    };
  }

  if (String(rawValue) === "" && criteria.allowEmpty !== true) return { records: [...sourceRecords], error: null };

  if (type === "nominal" || type === "date") {
    return {
      records: sourceRecords.filter((record) => !isMissing(record, attributeIndex) && String(record.values[attributeIndex]) === String(rawValue)),
      error: null
    };
  }

  if (type === "string") {
    const query = String(rawValue).toLowerCase();
    return {
      records: sourceRecords.filter((record) => {
        if (isMissing(record, attributeIndex)) return false;
        const observed = String(record.values[attributeIndex]);
        return criteria.exact === true ? observed === String(rawValue) : observed.toLowerCase().includes(query);
      }),
      error: null
    };
  }

  return { records: [...sourceRecords], error: null };
}

export default filterRecords;
