import assert from "node:assert/strict";
import test from "node:test";
import { validateArffFile } from "../backend/utils/arffValidator.js";

function file(content, name = "sample.arff", size) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return { originalname: name, buffer, size: size ?? buffer.length };
}

test("validates well-formed files with supported attribute types", () => {
  const result = validateArffFile(file(`\uFEFF% comment\r\n@relation demo\r\n@attribute count integer\r\n@attribute label {yes,no}\r\n@attribute note string\r\n@attribute day date 'yyyy-MM-dd'\r\n@data\r\n+4,yes,"hello, world",2026-09-06`));
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("rejects absent or unreadable files", () => {
  assert.match(validateArffFile(null).errors[0], /could not be read/i);
  assert.match(validateArffFile({ originalname: "x.arff", buffer: "not a buffer", size: 1 }).errors[0], /could not be read/i);
  assert.match(validateArffFile(file("  \n% only comment")).errors[0], /empty/i);
});

test("enforces extension and size limits", () => {
  assert.match(validateArffFile(file("data", "data.txt")).errors[0], /\.arff extension/i);
  assert.match(validateArffFile(file("small", "data.arff", 10 * 1024 * 1024 + 1)).errors[0], /10 MB/i);
  assert.match(validateArffFile(file(Buffer.alloc(10 * 1024 * 1024 + 1))).errors[0], /10 MB/i);
});

test("checks declaration order, required declarations, and duplicates", () => {
  const cases = [
    ["@attribute a numeric\n@relation x\n@data\n1", /invalid @attribute declaration/i],
    ["@relation x\n@attribute a numeric", /missing @data/i],
    ["@relation x\n@data\n1", /missing @attribute/i],
    ["@relation x\n@relation y\n@attribute a numeric\n@data\n1", /duplicate @relation/i],
    ["@relation x\n@attribute A numeric\n@attribute a string\n@data\n1", /duplicate attribute/i],
    ["@relation x\n@attribute a numeric\n@data extra\n1", /missing @data section/i],
    ["@relation x\n@attribute a numeric\n@data", /missing data rows/i]
  ];
  for (const [source, expected] of cases) assert.match(validateArffFile(file(source)).errors[0], expected, source);
});

test("rejects malformed and unsupported attribute declarations", () => {
  for (const attribute of ["@attribute a", "@attribute a date junk", "@attribute a {x,x}", "@attribute a {x,}", "@attribute a relational"]) {
    const result = validateArffFile(file(`@relation x\n${attribute}\n@data\n1`));
    assert.equal(result.valid, false, attribute);
  }
});

test("checks row widths, quoted values, and data types", () => {
  const cases = [
    ["@relation x\n@attribute a numeric\n@attribute b string\n@data\n1", /expected 2/i],
    ["@relation x\n@attribute a string\n@data\n\"unfinished", /invalid quoted values/i],
    ["@relation x\n@attribute a numeric\n@data\nNaN", /invalid numeric value/i],
    ["@relation x\n@attribute a integer\n@data\n1.5", /invalid numeric value/i],
    ["@relation x\n@attribute a {yes,no}\n@data\nmaybe", /invalid nominal value/i],
    ["@relation x\n@attribute a date\n@data\nnot-a-date", /invalid date value/i]
  ];
  for (const [source, expected] of cases) assert.match(validateArffFile(file(source)).errors[0], expected, source);
});

test("allows missing markers but treats quoted question marks as values", () => {
  const missing = validateArffFile(file("@relation x\n@attribute n numeric\n@attribute s string\n@data\n?,?"));
  assert.equal(missing.valid, true);
  const quoted = validateArffFile(file('@relation x\n@attribute s string\n@data\n"?"'));
  assert.equal(quoted.valid, true);
});
