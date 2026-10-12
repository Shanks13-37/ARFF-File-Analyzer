import assert from "node:assert/strict";
import test from "node:test";
import { validateArffHeader } from "../backend/arff/headerValidator.js";

test("accepts ARFF header directives after comments and a UTF-8 BOM", () => {
  const result = validateArffHeader("\uFEFF% dataset comment\n@relation sample\n@attribute value numeric\n@data\n1");
  assert.deepEqual(result, { valid: true });
});

test("rejects renamed non-ARFF text files", () => {
  const result = validateArffHeader("{\"name\":\"not an arff file\"}");
  assert.equal(result.valid, false);
  assert.equal(result.code, "INVALID_ARFF_HEADER");
  assert.match(result.message, /@RELATION.*@ATTRIBUTE.*@DATA/);
});

test("rejects binary content and incomplete ARFF headers", () => {
  assert.equal(validateArffHeader(Buffer.from([0, 1, 2])).valid, false);
  assert.equal(validateArffHeader("@relation sample\n@data\n").valid, false);
  assert.equal(validateArffHeader("@relation sample\n@attribute value numeric").valid, false);
});
