import assert from "node:assert/strict";
import test from "node:test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
const { createQualityEvaluationHandler } = await import("../../api/quality.js");

function request(content, rules = []) {
  const req = { file: { originalname: "checks.arff", size: Buffer.byteLength(content), buffer: Buffer.from(content) }, body: { rules: JSON.stringify(rules) } };
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return { req, res };
}

test("quality endpoint handler reparses a file and returns a separate quality result", () => {
  const { req, res } = request("@relation api\n@attribute value numeric\n@data\n1\n10", [{ id: "range", name: "Bound values", type: "numeric_range", severity: "error", enabled: true, config: { attribute: "value", maximum: 5 } }]);
  createQualityEvaluationHandler()(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.parseValid, true);
  assert.equal(res.body.qualityAssessment.ruleResults[0].status, "failed");
  assert.equal(res.body.qualityAssessment.ruleResults[0].failureDetails[0].value, "10");
});

test("quality endpoint rejects malformed rules and files with no safely usable schema", () => {
  const invalidRule = request("@relation api\n@attribute value numeric\n@data\n1", [{ id: "wrong", name: "Bad range", type: "numeric_range", severity: "warning", enabled: true, config: { attribute: "value", minimum: 4, maximum: 1 } }]);
  createQualityEvaluationHandler()(invalidRule.req, invalidRule.res);
  assert.equal(invalidRule.res.statusCode, 400);
  assert.ok(invalidRule.res.body.errors.length > 0);

  const noSchema = request("@relation api\n@attribute value {\n@data\nx", []);
  createQualityEvaluationHandler()(noSchema.req, noSchema.res);
  assert.equal(noSchema.res.statusCode, 422);
  assert.match(noSchema.res.body.error, /usable schema/i);
});
