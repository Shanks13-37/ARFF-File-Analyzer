import assert from "node:assert/strict";
import test from "node:test";
import { getMissingChartData, getReportSections, getTypeChartData } from "../frontend/src/components/analysisVisualData.js";

test("represents attribute type counts correctly", () => {
  assert.deepEqual(getTypeChartData({ attributeTypeCounts: { numeric: 2, nominal: 1, string: 0, date: 3 } }), [
    { type: "numeric", value: 2 },
    { type: "nominal", value: 1 },
    { type: "string", value: 0 },
    { type: "date", value: 3 }
  ]);
});

test("represents missing-value counts correctly", () => {
  const result = getMissingChartData({
    attributes: [{ index: 0, name: "age", missingCount: 2 }, { index: 1, name: "class", missingCount: 0 }],
    missingValues: { byAttribute: [{ index: 0, name: "age", count: 2 }, { index: 1, name: "class", count: 0 }] }
  });
  assert.deepEqual(result, [{ index: 0, name: "age", value: 2 }, { index: 1, name: "class", value: 0 }]);
});

test("handles zero missing values and empty datasets", () => {
  assert.deepEqual(getMissingChartData({ attributes: [], missingValues: { total: 0, byAttribute: [] } }), []);
  assert.deepEqual(getTypeChartData({ attributeTypeCounts: {} }).map((entry) => entry.value), [0, 0, 0, 0]);
});

test("report sections include required analysis sections", () => {
  assert.deepEqual(getReportSections({}).map((entry) => entry.section), [
    "dataset statistics",
    "attribute type counts",
    "attribute information",
    "missing-value summary",
    "duplicate-record summary",
    "type-validation results",
    "statistical charts"
  ]);
});

test("report source data retains violations and duplicates", () => {
  const result = { typeViolations: [{ message: "bad value" }], duplicates: [{ recordIndices: [0, 1] }] };
  assert.equal(result.typeViolations[0].message, "bad value");
  assert.deepEqual(result.duplicates[0].recordIndices, [0, 1]);
});
