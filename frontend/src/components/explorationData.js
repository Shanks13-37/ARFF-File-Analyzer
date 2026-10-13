import { isMissing, isNumericType, isValidNumeric, parseDateValue } from "../../../backend/arff/valueValidation.js";

export const HISTOGRAM_BINS = 12;
export const CATEGORY_LIMIT = 12;
export const SCATTER_POINT_LIMIT = 1000;
export const CORRELATION_ATTRIBUTE_LIMIT = 8;
export const CORRELATION_ROW_LIMIT = 20000;

function valueAt(record, index) {
  return record?.values?.[index];
}

function missingAt(record, index) {
  return isMissing(valueAt(record, index), record?.quotedValues?.[index] === true);
}

function numericAt(record, attribute) {
  const value = valueAt(record, attribute.index);
  if (missingAt(record, attribute.index) || !isValidNumeric(value, attribute.type)) return null;
  const number = Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

function evenlySample(items, limit) {
  if (items.length <= limit) return items;
  const stride = items.length / limit;
  return Array.from({ length: limit }, (_unused, index) => items[Math.floor(index * stride)]);
}

export function prepareHistogram(records = [], attribute, requestedBins = HISTOGRAM_BINS) {
  let missingCount = 0;
  let invalidCount = 0;
  let validCount = 0;
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const record of records) {
    if (missingAt(record, attribute.index)) missingCount += 1;
    else {
      const value = numericAt(record, attribute);
      if (value === null) invalidCount += 1;
      else {
        validCount += 1;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
    }
  }
  if (!validCount) return { bins: [], validCount: 0, missingCount, invalidCount, minimum: null, maximum: null };
  const binCount = minimum === maximum ? 1 : Math.max(1, Math.min(30, Math.trunc(requestedBins) || HISTOGRAM_BINS));
  const scale = Math.max(1, Math.abs(minimum), Math.abs(maximum));
  const scaledRange = maximum / scale - minimum / scale;
  const bins = Array.from({ length: binCount }, (_unused, index) => {
    const startFraction = index / binCount;
    const endFraction = (index + 1) / binCount;
    return {
      index,
      start: minimum * (1 - startFraction) + maximum * startFraction,
      end: minimum * (1 - endFraction) + maximum * endFraction,
      count: 0
    };
  });
  for (const record of records) {
    const value = numericAt(record, attribute);
    if (value === null) continue;
    const position = scaledRange === 0 ? 0 : (value / scale - minimum / scale) / scaledRange;
    bins[Math.min(binCount - 1, Math.max(0, Math.floor(position * binCount)))].count += 1;
  }
  return { bins, validCount, missingCount, invalidCount, minimum, maximum };
}

export function prepareCategoryFrequencies(records = [], attribute, limit = CATEGORY_LIMIT) {
  const counts = new Map();
  let missingCount = 0;
  for (const record of records) {
    if (missingAt(record, attribute.index)) {
      missingCount += 1;
      continue;
    }
    const value = String(valueAt(record, attribute.index));
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const all = [...counts].map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
  return { categories: all.slice(0, limit), totalDistinct: all.length, validCount: all.reduce((sum, entry) => sum + entry.count, 0), missingCount, truncated: all.length > limit };
}

export function prepareDateDistribution(records = [], attribute, limit = CATEGORY_LIMIT) {
  const counts = new Map();
  let missingCount = 0;
  let invalidCount = 0;
  for (const record of records) {
    if (missingAt(record, attribute.index)) {
      missingCount += 1;
      continue;
    }
    const parsed = parseDateValue(valueAt(record, attribute.index), attribute.dateFormat);
    if (!parsed.valid) {
      invalidCount += 1;
      continue;
    }
    const date = new Date(parsed.timestamp);
    const key = String(date.getUTCFullYear()) + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const points = [...counts].sort(([left], [right]) => left.localeCompare(right)).map(([period, count]) => ({ value: period, count }));
  return { points: points.length > limit ? evenlySample(points, limit) : points, totalPeriods: points.length, validCount: points.reduce((sum, entry) => sum + entry.count, 0), missingCount, invalidCount, truncated: points.length > limit };
}

export function prepareScatter(records = [], xAttribute, yAttribute, limit = SCATTER_POINT_LIMIT) {
  let validCount = 0;
  let excludedCount = 0;
  for (const record of records) {
    const x = numericAt(record, xAttribute);
    const y = numericAt(record, yAttribute);
    if (x === null || y === null) excludedCount += 1;
    else validCount += 1;
  }
  const sampleCount = Math.min(validCount, limit);
  const points = [];
  let validIndex = 0;
  let target = 0;
  for (const record of records) {
    if (target >= sampleCount) break;
    const x = numericAt(record, xAttribute);
    const y = numericAt(record, yAttribute);
    if (x === null || y === null) continue;
    if (validIndex === Math.floor(target * validCount / sampleCount)) {
      points.push({ recordIndex: record.index, x, y });
      target += 1;
    }
    validIndex += 1;
  }
  return { points, validCount, excludedCount, sampled: points.length < validCount, sampleLimit: limit };
}

export function prepareCorrelation(records = [], attributes = [], indices) {
  const numericAttributes = attributes.filter((attribute) => isNumericType(attribute.type));
  const selected = Array.isArray(indices) && indices.length
    ? numericAttributes.filter((attribute) => indices.includes(attribute.index))
    : numericAttributes.slice(0, CORRELATION_ATTRIBUTE_LIMIT);
  const attrs = selected.slice(0, CORRELATION_ATTRIBUTE_LIMIT);
  const sampledRecords = evenlySample(records, CORRELATION_ROW_LIMIT);
  const matrix = attrs.map((left) => attrs.map((right) => {
    let count = 0;
    let scaleX = 0;
    let scaleY = 0;
    for (const record of sampledRecords) {
      const x = numericAt(record, left);
      const y = numericAt(record, right);
      if (x !== null && y !== null) {
        scaleX = Math.max(scaleX, Math.abs(x));
        scaleY = Math.max(scaleY, Math.abs(y));
      }
    }
    scaleX = Math.max(scaleX, 1);
    scaleY = Math.max(scaleY, 1);
    let meanX = 0;
    let meanY = 0;
    let sumXX = 0;
    let sumYY = 0;
    let sumXY = 0;
    for (const record of sampledRecords) {
      const x = numericAt(record, left);
      const y = numericAt(record, right);
      if (x === null || y === null) continue;
      count += 1;
      const scaledX = x / scaleX;
      const scaledY = y / scaleY;
      const dx = scaledX - meanX;
      const dy = scaledY - meanY;
      meanX += dx / count;
      meanY += dy / count;
      sumXX += dx * (scaledX - meanX);
      sumYY += dy * (scaledY - meanY);
      sumXY += dx * (scaledY - meanY);
    }
    const candidate = count < 2 || sumXX <= 0 || sumYY <= 0 ? null : sumXY / Math.sqrt(sumXX * sumYY);
    const correlation = Number.isFinite(candidate) ? candidate : null;
    return { correlation: correlation === null ? null : Math.max(-1, Math.min(1, correlation)), count };
  }));
  return { attributes: attrs, matrix, sampled: sampledRecords.length < records.length, rowsAnalyzed: sampledRecords.length, rowLimit: CORRELATION_ROW_LIMIT };
}
