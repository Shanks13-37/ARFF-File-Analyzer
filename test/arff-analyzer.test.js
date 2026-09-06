import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDataset } from "../backend/arff/analyzer.js";
import { parseArff } from "../backend/arff/parser.js";

function analyze(text) {
  const parsed = parseArff(text);
  assert.equal(parsed.valid, true, JSON.stringify(parsed.errors));
  return analyzeDataset(parsed.dataset);
}

test("computes statistics for a normal dataset", () => {
  const result = analyze("@relation stats\n@attribute age numeric\n@attribute class {a,b}\n@data\n1,a\n2,b");
  assert.deepEqual(result.summary, { instanceCount: 2, attributeCount: 2, missingValueCount: 0, duplicateRecordCount: 0 });
  assert.deepEqual(result.attributeTypeCounts, { numeric: 1, nominal: 1, string: 0, date: 0 });
});

test("accepts valid numeric values", () => {
  const result = analyze("@relation numeric\n@attribute a numeric\n@attribute b integer\n@attribute c real\n@data\n1,2,3.5");
  assert.equal(result.valid, true);
  assert.equal(result.typeViolations.length, 0);
});

test("reports invalid numeric values", () => {
  const result = analyze("@relation numeric\n@attribute a numeric\n@data\nnot-a-number");
  assert.equal(result.valid, false);
  assert.equal(result.typeViolations[0].code, "INVALID_NUMERIC_VALUE");
  assert.equal(result.typeViolations[0].attributeName, "a");
});

test("accepts and describes nominal values", () => {
  const result = analyze("@relation nominal\n@attribute color {red,blue}\n@data\nred");
  assert.equal(result.valid, true);
  assert.deepEqual(result.attributes[0].nominalValues, ["red", "blue"]);
});

test("reports invalid nominal values", () => {
  const result = analyze("@relation nominal\n@attribute color {red,blue}\n@data\ngreen");
  assert.equal(result.valid, false);
  assert.equal(result.typeViolations[0].code, "INVALID_NOMINAL_VALUE");
});

test("accepts arbitrary string values", () => {
  const result = analyze('@relation strings\n@attribute text string\n@data\n"anything, including commas"');
  assert.equal(result.valid, true);
  assert.equal(result.attributes[0].validValueCount, 1);
});

test("validates declared date formats", () => {
  const result = analyze("@relation dates\n@attribute happened date 'yyyy-MM-dd'\n@data\n2026-09-06");
  assert.equal(result.valid, true);
  assert.equal(result.attributes[0].type, "date");
});

test("counts missing values", () => {
  const result = analyze("@relation missing\n@attribute a numeric\n@attribute b string\n@data\n?,hello");
  assert.equal(result.valid, true);
  assert.equal(result.missingValues.total, 1);
  assert.equal(result.attributes[0].missingCount, 1);
  assert.equal(result.attributes[0].validValueCount, 0);
});

test("counts multiple missing values by attribute", () => {
  const result = analyze("@relation missing\n@attribute a numeric\n@attribute b {x,y}\n@data\n?,?\n?,x");
  assert.equal(result.missingValues.total, 3);
  assert.deepEqual(result.missingValues.byAttribute.map((entry) => entry.count), [2, 1]);
});

test("identifies duplicate records and counts repeated occurrences", () => {
  const result = analyze("@relation duplicates\n@attribute a numeric\n@attribute b string\n@data\n1,x\n1,x\n1,x");
  assert.equal(result.summary.duplicateRecordCount, 2);
  assert.deepEqual(result.duplicates, [{ recordIndices: [0, 1, 2], duplicateRecordCount: 2, values: ["1", "x"] }]);
});

test("identifies multiple duplicate groups", () => {
  const result = analyze("@relation duplicates\n@attribute a numeric\n@data\n1\n2\n1\n3\n2");
  assert.equal(result.summary.duplicateRecordCount, 2);
  assert.deepEqual(result.duplicates.map((group) => group.recordIndices), [[0, 2], [1, 4]]);
});

test("handles a record containing missing and invalid values", () => {
  const result = analyze("@relation mixed\n@attribute number numeric\n@attribute label {yes,no}\n@data\n?,maybe");
  assert.equal(result.missingValues.total, 1);
  assert.equal(result.typeViolations.length, 1);
  assert.equal(result.typeViolations[0].attributeName, "label");
});

test("analyzes an empty dataset", () => {
  const result = analyze("@relation empty\n@attribute value numeric\n@data");
  assert.deepEqual(result.summary, { instanceCount: 0, attributeCount: 1, missingValueCount: 0, duplicateRecordCount: 0 });
  assert.equal(result.valid, true);
});

test("handles mixed numeric, nominal, string, and date attributes", () => {
  const result = analyze("@relation mixed\n@attribute count integer\n@attribute kind {one,two}\n@attribute note string\n@attribute day date 'yyyy-MM-dd'\n@data\n4,one,hello,2026-09-06");
  assert.deepEqual(result.attributeTypeCounts, { numeric: 1, nominal: 1, string: 1, date: 1 });
  assert.equal(result.valid, true);
});

test("collects multiple type violations in one dataset", () => {
  const result = analyze("@relation invalid\n@attribute number numeric\n@attribute kind {one,two}\n@attribute day date 'yyyy-MM-dd'\n@data\nno,three,2026-99-40\ninvalid,four,not-a-date");
  assert.equal(result.valid, false);
  assert.equal(result.typeViolations.length, 6);
  assert.deepEqual(result.typeViolations.map((error) => error.code), [
    "INVALID_NUMERIC_VALUE", "INVALID_NOMINAL_VALUE", "INVALID_DATE_VALUE",
    "INVALID_NUMERIC_VALUE", "INVALID_NOMINAL_VALUE", "INVALID_DATE_VALUE"
  ]);
});
