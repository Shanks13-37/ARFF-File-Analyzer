import assert from "node:assert/strict";
import test from "node:test";
import { parseArff } from "../backend/arff/parser.js";

function parse(text) {
  const result = parseArff(text);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  return result.dataset;
}

test("parses numeric attributes and records", () => {
  const dataset = parse(`@relation numbers\n@attribute age numeric\n@attribute score real\n@data\n1,2.5\n2,3`);
  assert.equal(dataset.relation, "numbers");
  assert.deepEqual(dataset.attributes.map(({ name, type }) => ({ name, type })), [
    { name: "age", type: "numeric" },
    { name: "score", type: "real" }
  ]);
  assert.deepEqual(dataset.records[0].values, ["1", "2.5"]);
});

test("parses nominal attributes", () => {
  const dataset = parse("@relation weather\n@attribute outlook {sunny, overcast, rainy}\n@data\nsunny");
  assert.deepEqual(dataset.attributes[0].nominalValues, ["sunny", "overcast", "rainy"]);
});

test("parses string attributes", () => {
  const dataset = parse('@relation messages\n@attribute text string\n@data\n"hello, world"');
  assert.deepEqual(dataset.records[0].values, ["hello, world"]);
});

test("parses date attributes", () => {
  const dataset = parse("@relation events\n@attribute happened date 'yyyy-MM-dd'\n@data\n2026-09-06");
  assert.equal(dataset.attributes[0].type, "date");
  assert.equal(dataset.attributes[0].dateFormat, "yyyy-MM-dd");
});

test("represents missing values as null", () => {
  const dataset = parse("@relation missing\n@attribute value numeric\n@data\n?");
  assert.deepEqual(dataset.records[0].values, [null]);
});

test("parses quoted relation names, attribute names, and values", () => {
  const dataset = parse('@relation "sales data"\n@attribute "customer name" string\n@data\n"Ada Lovelace"');
  assert.equal(dataset.relation, "sales data");
  assert.equal(dataset.attributes[0].name, "customer name");
  assert.equal(dataset.records[0].values[0], "Ada Lovelace");
});

test("reports a missing relation", () => {
  const result = parseArff("@attribute value numeric\n@data\n1");
  assert.ok(result.errors.some((error) => error.code === "MISSING_RELATION"));
});

test("reports a missing data declaration", () => {
  const result = parseArff("@relation incomplete\n@attribute value numeric");
  assert.ok(result.errors.some((error) => error.code === "MISSING_DATA"));
});

test("reports malformed attributes", () => {
  const result = parseArff("@relation broken\n@attribute value {one,two\n@data\none");
  assert.ok(result.errors.some((error) => error.code === "MALFORMED_ATTRIBUTE"));
});

test("reports data rows with incorrect field counts", () => {
  const result = parseArff("@relation rows\n@attribute a numeric\n@attribute b numeric\n@data\n1");
  const error = result.errors.find((entry) => entry.code === "WRONG_FIELD_COUNT");
  assert.equal(error.line, 5);
});

test("ignores comments and blank lines while preserving source lines", () => {
  const dataset = parse(`% comment\n\n@relation lines\n\n@attribute value string\n% another comment\n@data\n\nhello`);
  assert.equal(dataset.records[0].sourceLine, 9);
});

test("collects multiple independent syntax errors", () => {
  const result = parseArff("@attribute missing numeric\n@relation late\n@attribute broken {a,b\n@data\n1,2");
  assert.ok(result.errors.length >= 3);
  assert.ok(result.errors.some((error) => error.code === "INVALID_DECLARATION_ORDER"));
  assert.ok(result.errors.some((error) => error.code === "MALFORMED_ATTRIBUTE"));
  assert.ok(result.errors.some((error) => error.code === "WRONG_FIELD_COUNT"));
});
