import assert from "node:assert/strict";
import test from "node:test";
import {
  CATEGORY_LIMIT,
  CORRELATION_ROW_LIMIT,
  SCATTER_POINT_LIMIT,
  prepareCategoryFrequencies,
  prepareCorrelation,
  prepareDateDistribution,
  prepareHistogram,
  prepareScatter
} from "../../frontend/src/components/explorationData.js";
import { filterRecords } from "../../frontend/src/components/filterRecords.js";

const numeric = { index: 0, name: "x", type: "numeric" };
const row = (...values) => ({ values, quotedValues: values.map(() => false) });

test("histogram creates readable boundaries and counts negatives at bin edges", () => {
  const result = prepareHistogram([-3, -2, -1, 0, 1, 2, 3].map((value) => row(String(value))), numeric, 2);
  assert.equal(result.minimum, -3);
  assert.equal(result.maximum, 3);
  assert.deepEqual(result.bins.map(({ start, end, count }) => ({ start, end, count })), [
    { start: -3, end: 0, count: 3 },
    { start: 0, end: 3, count: 4 }
  ]);
});

test("histogram handles constant, empty, missing, invalid and extreme finite values", () => {
  const constant = prepareHistogram([row("2.5"), row("2.5")], numeric);
  assert.equal(constant.bins.length, 1);
  assert.equal(constant.bins[0].count, 2);
  const empty = prepareHistogram([row(null), row("NaN"), row("Infinity"), row("bad")], numeric);
  assert.equal(empty.validCount, 0);
  assert.equal(empty.missingCount, 1);
  assert.equal(empty.invalidCount, 3);
  assert.equal(empty.minimum, null);
  const extremes = prepareHistogram([row("-1e308"), row("1e308")], numeric, 4);
  assert.equal(extremes.bins.reduce((sum, bin) => sum + bin.count, 0), 2);
  assert.ok(extremes.bins.every((bin) => Number.isFinite(bin.start) && Number.isFinite(bin.end)));
});

test("category frequencies preserve literal question marks and cap high-cardinality output", () => {
  const records = [row("?", null), ...Array.from({ length: CATEGORY_LIMIT + 5 }, (_unused, index) => row("v" + index))];
  records[0].quotedValues = [true, false];
  const result = prepareCategoryFrequencies(records, { index: 0, type: "string" });
  assert.equal(result.validCount, CATEGORY_LIMIT + 6);
  assert.equal(result.totalDistinct, CATEGORY_LIMIT + 6);
  assert.equal(result.missingCount, 0);
  assert.equal(result.categories.length, CATEGORY_LIMIT);
  assert.equal(result.truncated, true);
  assert.ok(result.categories.some((entry) => entry.value === "?"));

  const quotedQuestion = row("?");
  quotedQuestion.quotedValues = [true];
  const withMissing = prepareCategoryFrequencies([quotedQuestion, row(null)], { index: 0, type: "nominal" });
  assert.equal(withMissing.validCount, 1);
  assert.equal(withMissing.missingCount, 1);
});

test("date distribution respects declared formats and skips invalid and missing dates", () => {
  const records = [row("31/01/2024"), row("2024-02-01"), row(null)];
  const result = prepareDateDistribution(records, { index: 0, type: "date", dateFormat: "dd/MM/yyyy" });
  assert.equal(result.validCount, 1);
  assert.equal(result.invalidCount, 1);
  assert.equal(result.missingCount, 1);
  assert.deepEqual(result.points, [{ value: "2024-01", count: 1 }]);
});

test("scatter preparation excludes missing and invalid axis values", () => {
  const records = [
    { index: 4, values: ["1", "3"], quotedValues: [false, false] },
    { index: 5, values: [null, "4"], quotedValues: [false, false] },
    { index: 6, values: ["2", "NaN"], quotedValues: [false, false] },
    { index: 7, values: ["-1.5", "8"], quotedValues: [false, false] }
  ];
  const result = prepareScatter(records, numeric, { index: 1, type: "real" });
  assert.deepEqual(result.points, [{ recordIndex: 4, x: 1, y: 3 }, { recordIndex: 7, x: -1.5, y: 8 }]);
  assert.equal(result.validCount, 2);
  assert.equal(result.excludedCount, 2);
});

test("Pearson correlation returns expected perfect, negative, missing-pair and undefined results", () => {
  const attributes = [numeric, { index: 1, name: "inverse", type: "real" }, { index: 2, name: "constant", type: "integer" }];
  const records = [
    { values: ["1", "6", "4"], quotedValues: [false, false, false] },
    { values: ["2", "4", "4"], quotedValues: [false, false, false] },
    { values: ["3", "2", "4"], quotedValues: [false, false, false] },
    { values: [null, "0", "4"], quotedValues: [false, false, false] }
  ];
  const result = prepareCorrelation(records, attributes);
  assert.equal(result.matrix[0][0].correlation, 1);
  assert.equal(result.matrix[0][0].count, 3);
  assert.equal(result.matrix[0][1].correlation, -1);
  assert.equal(result.matrix[0][1].count, 3);
  assert.equal(result.matrix[0][2].correlation, null);
  assert.equal(result.matrix[0][2].count, 3);
  const insufficient = prepareCorrelation([
    { values: ["1", "2"], quotedValues: [false, false] },
    { values: [null, "3"], quotedValues: [false, false] }
  ], attributes.slice(0, 2));
  assert.equal(insufficient.matrix[0][1].correlation, null);
  assert.equal(insufficient.matrix[0][1].count, 1);
  const extreme = prepareCorrelation([
    { values: ["-1e308", "-1e308"], quotedValues: [false, false] },
    { values: ["1e308", "1e308"], quotedValues: [false, false] }
  ], attributes.slice(0, 2));
  assert.equal(extreme.matrix[0][1].correlation, 1);
});

test("scatter and correlation sampling are deterministic and disclose caps", () => {
  const records = Array.from({ length: SCATTER_POINT_LIMIT + 17 }, (_unused, index) => row(String(index), String(index * 2)));
  const scatter = prepareScatter(records.map((entry, index) => ({ ...entry, index })), numeric, { index: 1, type: "numeric" });
  assert.equal(scatter.points.length, SCATTER_POINT_LIMIT);
  assert.equal(scatter.sampled, true);
  assert.deepEqual(scatter.points.slice(0, 3).map((point) => point.recordIndex), [0, 1, 2]);
  const corrRecords = Array.from({ length: CORRELATION_ROW_LIMIT + 9 }, (_unused, index) => row(String(index), String(index * 2)));
  const attrs = [numeric, { index: 1, type: "numeric" }];
  const first = prepareCorrelation(corrRecords, attrs);
  const second = prepareCorrelation(corrRecords, attrs);
  assert.equal(first.rowsAnalyzed, CORRELATION_ROW_LIMIT);
  assert.equal(first.sampled, true);
  assert.deepEqual(first.matrix, second.matrix);
});

test("filtering treats quoted question mark as observed and clearing restores each dataset", () => {
  const firstFile = [
    { index: 0, values: ["?", "a"], quotedValues: [true, false] },
    { index: 1, values: [null, "b"], quotedValues: [false, false] },
    { index: 2, values: ["", "c"], quotedValues: [false, false] }
  ];
  const selected = filterRecords(firstFile, { index: 0, type: "string" }, { value: "?" });
  assert.deepEqual(selected.records.map((entry) => entry.index), [0]);
  const emptyCategory = filterRecords(firstFile, { index: 0, type: "string" }, { value: "", exact: true, allowEmpty: true });
  assert.deepEqual(emptyCategory.records.map((entry) => entry.index), [2]);
  const caseSensitiveCategory = filterRecords([
    { index: 0, values: ["Group"], quotedValues: [false] },
    { index: 1, values: ["group"], quotedValues: [false] }
  ], { index: 0, type: "string" }, { value: "Group", exact: true });
  assert.deepEqual(caseSensitiveCategory.records.map((entry) => entry.index), [0]);
  assert.deepEqual(filterRecords(firstFile, null, {}).records, firstFile);
  const secondFile = [{ index: 0, values: ["other"], quotedValues: [false] }];
  assert.deepEqual(filterRecords(secondFile, null, {}).records, secondFile);
});
