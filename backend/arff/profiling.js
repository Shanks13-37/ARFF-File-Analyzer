import { isMissing, isNumericType, isValidNumeric, parseDateValue, validateValue } from "./valueValidation.js";

export const FREQUENCY_LIMIT = 10;
export const OUTLIER_SAMPLE_LIMIT = 50;

function percentile(sorted, probability) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return lower === upper ? sorted[lower] : sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function frequencyEntries(values, limit) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const all = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return { totalDistinct: all.length, displayed: all.slice(0, limit).map(([value, count]) => ({ value, count, percentage: values.length ? (count / values.length) * 100 : null })), truncated: all.length > limit, totalObserved: values.length };
}

function base(attribute, total, missing, valid, invalid, distinct) {
  return { index: attribute.index, name: attribute.name, type: String(attribute.type || "").toLowerCase(), totalRecords: total, missingCount: missing, missingPercentage: total ? (missing / total) * 100 : null, validValueCount: valid, invalidValueCount: invalid, distinctValueCount: distinct };
}

function numericProfile(attribute, records, total, missing) {
  const valid = [];
  let invalid = 0;
  for (const [index, record] of records.entries()) {
    const value = record?.values?.[attribute.index];
    if (isMissing(value, record?.quotedValues?.[attribute.index])) continue;
    if (isValidNumeric(value, attribute.type)) valid.push({ number: Number(String(value).trim()), recordIndex: record.index ?? index, value });
    else invalid += 1;
  }
  const numbers = valid.map((entry) => entry.number).sort((a, b) => a - b);
  const distinct = new Set(valid.map((entry) => entry.number)).size;
  if (!numbers.length) return { ...base(attribute, total, missing, 0, invalid, distinct), statistics: null, outliers: { method: "1.5 × IQR fences", count: 0, sample: [], sampleLimit: OUTLIER_SAMPLE_LIMIT, sampleTruncated: false } };
  const scale = numbers.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0) || 1;
  const scaledMean = numbers.reduce((sum, value) => sum + value / scale, 0) / numbers.length;
  const mean = scaledMean * scale;
  const scaledVariance = numbers.reduce((sum, value) => sum + ((value / scale - scaledMean) ** 2), 0) / numbers.length;
  const standardDeviation = Math.sqrt(scaledVariance) * scale;
  const varianceValue = scaledVariance * scale * scale;
  const variance = Number.isFinite(varianceValue) ? varianceValue : null;
  const q1 = percentile(numbers, 0.25);
  const median = percentile(numbers, 0.5);
  const q3 = percentile(numbers, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - (1.5 * iqr);
  const upperFence = q3 + (1.5 * iqr);
  const outlierEntries = valid.filter((entry) => entry.number < lowerFence || entry.number > upperFence);
  const range = numbers[numbers.length - 1] - numbers[0];
  return { ...base(attribute, total, missing, numbers.length, invalid, distinct), statistics: { minimum: numbers[0], maximum: numbers[numbers.length - 1], range: Number.isFinite(range) ? range : null, mean, median, variance, standardDeviation: Number.isFinite(standardDeviation) ? standardDeviation : null, q1, q3, iqr: Number.isFinite(iqr) ? iqr : null, percentile5: percentile(numbers, 0.05), percentile95: percentile(numbers, 0.95) }, outliers: { method: "1.5 × IQR fences", lowerFence, upperFence, count: outlierEntries.length, sample: outlierEntries.slice(0, OUTLIER_SAMPLE_LIMIT).map(({ recordIndex, value }) => ({ recordIndex, value })), sampleLimit: OUTLIER_SAMPLE_LIMIT, sampleTruncated: outlierEntries.length > OUTLIER_SAMPLE_LIMIT } };
}

export function profileDataset(dataset, options = {}) {
  const attributes = Array.isArray(dataset?.attributes) ? dataset.attributes : [];
  const records = Array.isArray(dataset?.records) ? dataset.records : [];
  const frequencyLimit = options.frequencyLimit ?? FREQUENCY_LIMIT;
  const profiles = attributes.map((attribute, index) => {
    const normalized = { ...attribute, index: attribute.index ?? index };
    const missing = records.reduce((count, record) => count + (isMissing(record?.values?.[normalized.index], record?.quotedValues?.[normalized.index]) ? 1 : 0), 0);
    const type = String(normalized.type || "").toLowerCase();
    if (isNumericType(type)) return numericProfile(normalized, records, records.length, missing);
    const observed = [];
    let invalid = 0;
    let valid = 0;
    let emptyStringCount = 0;
    const dateValues = [];
    let unsupportedDateFormat = false;
    records.forEach((record) => {
      const value = record?.values?.[normalized.index];
      const quoted = record?.quotedValues?.[normalized.index];
      if (isMissing(value, quoted)) return;
      if (type === "string" && !String(value).trim()) emptyStringCount += 1;
      const parsedDate = type === "date" ? parseDateValue(value, normalized.dateFormat) : null;
      if (type === "date" && parsedDate.reason === "unsupported-format") unsupportedDateFormat = true;
      if (type === "date" ? parsedDate.valid : validateValue(value, normalized)) {
        valid += 1;
        observed.push(String(value));
        if (type === "date") dateValues.push(parsedDate);
      } else invalid += 1;
    });
    const result = { ...base(normalized, records.length, missing, valid, invalid, new Set(observed).size) };
    if (type === "nominal" || type === "string") {
      result.frequencies = { ...frequencyEntries(observed, frequencyLimit), frequencyLimit };
      if (type === "nominal") {
        const counts = new Map();
        observed.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
        result.declaredCategories = normalized.nominalValues.map((value) => {
          const count = counts.get(value) || 0;
          return { value, count, percentage: observed.length ? (count / observed.length) * 100 : null };
        });
      }
      if (type === "string") result.emptyOrWhitespaceCount = emptyStringCount;
    }
    if (type === "date") {
      const parsedDates = dateValues.filter((entry) => entry.valid).map((entry) => entry.timestamp);
      if (parsedDates.length === valid && parsedDates.length) {
        let earliestTimestamp = Infinity;
        let latestTimestamp = -Infinity;
        for (const timestamp of parsedDates) {
          earliestTimestamp = Math.min(earliestTimestamp, timestamp);
          latestTimestamp = Math.max(latestTimestamp, timestamp);
        }
        const rangeMilliseconds = latestTimestamp - earliestTimestamp;
        result.date = {
          earliest: new Date(earliestTimestamp).toISOString(),
          latest: new Date(latestTimestamp).toISOString(),
          rangeMilliseconds: Number.isFinite(rangeMilliseconds) ? rangeMilliseconds : null,
          parsing: normalized.dateFormat ? "declared-format" : "JavaScript Date.parse"
        };
      } else result.date = null;
      if (unsupportedDateFormat) result.dateLimitation = "The declared date format is not supported for reliable date statistics.";
      else if (!parsedDates.length && invalid) result.dateLimitation = "No non-missing values could be interpreted using the available date parser.";
    }
    return result;
  });
  return { version: 1, recordsAnalyzed: records.length, frequencyLimit, percentileMethod: "linear interpolation on sorted values at position (n − 1) × p", varianceMethod: "population variance (divide by n)", attributes: profiles };
}

export default profileDataset;
