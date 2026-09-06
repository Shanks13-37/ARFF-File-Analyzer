import assert from "node:assert/strict";
import test from "node:test";
import { filterRecords } from "../frontend/src/components/filterRecords.js";

const numeric = { index: 0, name: "age", type: "numeric" };
const nominal = { index: 1, name: "class", type: "nominal", nominalValues: ["yes", "no"] };
const string = { index: 2, name: "note", type: "string" };
const date = { index: 3, name: "day", type: "date" };
const records = [
  { index: 10, values: ["18", "yes", "Hello World", "2026-09-06"] },
  { index: 11, values: ["21", "no", "Another note", "2026-09-07"] },
  { index: 12, values: ["30", "yes", "HELLO again", "2026-09-08"] },
  { index: 13, values: [null, "no", null, "2026-09-09"] }
];

test("numeric exact match", () => {
  assert.deepEqual(filterRecords(records, numeric, { mode: "exact", value: "21" }).records.map((record) => record.index), [11]);
});

test("numeric minimum", () => {
  assert.deepEqual(filterRecords(records, numeric, { mode: "range", min: "21" }).records.map((record) => record.index), [11, 12]);
});

test("numeric maximum", () => {
  assert.deepEqual(filterRecords(records, numeric, { mode: "range", max: "21" }).records.map((record) => record.index), [10, 11]);
});

test("numeric inclusive range", () => {
  assert.deepEqual(filterRecords(records, numeric, { mode: "range", min: "18", max: "21" }).records.map((record) => record.index), [10, 11]);
});

test("invalid numeric filter returns a clear error", () => {
  assert.match(filterRecords(records, numeric, { mode: "exact", value: "abc" }).error, /valid number/i);
});

test("nominal exact match", () => {
  assert.deepEqual(filterRecords(records, nominal, { value: "yes" }).records.map((record) => record.index), [10, 12]);
});

test("string matching is case-insensitive and substring based", () => {
  assert.deepEqual(filterRecords(records, string, { value: "hello" }).records.map((record) => record.index), [10, 12]);
});

test("missing values are non-matching", () => {
  assert.deepEqual(filterRecords(records, numeric, { mode: "exact", value: "18" }).records.map((record) => record.index), [10]);
  assert.deepEqual(filterRecords(records, string, { value: "" }).records.map((record) => record.index), [10, 11, 12, 13]);
});

test("returns no matching records gracefully", () => {
  assert.deepEqual(filterRecords(records, nominal, { value: "maybe" }).records, []);
});

test("returns multiple matching records", () => {
  assert.equal(filterRecords(records, nominal, { value: "no" }).records.length, 2);
});

test("clearing criteria restores all records", () => {
  assert.deepEqual(filterRecords(records, numeric, { mode: "exact", value: "" }).records, records);
  assert.deepEqual(filterRecords(records, null, {}).records, records);
});

test("preserves original record indices", () => {
  const result = filterRecords(records, date, { value: "2026-09-08" });
  assert.equal(result.records[0].index, 12);
  assert.equal(result.records[0].values[0], "30");
});
