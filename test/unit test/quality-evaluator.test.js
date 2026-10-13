import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDataQuality, FAILURE_DETAIL_LIMIT, validateQualityRules } from "../../backend/arff/qualityEvaluator.js";
import { analyzeDataset } from "../../backend/arff/analyzer.js";
import { parseArff } from "../../backend/arff/parser.js";

function dataset(source) {
  const parsed = parseArff(source);
  const analysis = analyzeDataset(parsed.dataset);
  return { parsed, analysis, dataset: parsed.dataset, profile: analysis.statisticalProfile };
}

function evaluate(source, rules = []) {
  const fixture = dataset(source);
  return { ...fixture, result: evaluateDataQuality({ dataset: fixture.dataset, analysis: fixture.analysis, statisticalProfile: fixture.profile, parserErrors: fixture.parsed.errors, rules }) };
}

function rule(id, type, attribute, config, extra = {}) {
  return { id, name: id, type, severity: "warning", enabled: true, config: { ...(attribute ? { attribute } : {}), ...config }, ...extra };
}

const source = `@relation sample
@attribute number numeric
@attribute name string
@attribute color {red,blue}
@data
1,Ada,red
1,,blue
8,Grace,red
?,"?",?
1,Ada,red`;

test("computes completeness, validity, uniqueness, schema, and their denominators", () => {
  const { result } = evaluate(source);
  assert.equal(result.dimensions.completeness.totalCells, 15);
  assert.equal(result.dimensions.completeness.missingCount, 2);
  assert.ok(Math.abs(result.dimensions.completeness.missingPercentage - (200 / 15)) < 1e-12);
  assert.equal(result.dimensions.completeness.attributes[0].completenessPercentage, 80);
  assert.equal(result.dimensions.validity.typeViolationCount, 0);
  assert.equal(result.dimensions.uniqueness.duplicateRecordCount, 1);
  assert.equal(result.dimensions.uniqueness.duplicateGroupCount, 1);
  assert.equal(result.dimensions.uniqueness.duplicatePercentage, 20);
  assert.match(result.dimensions.uniqueness.denominator, /repeated occurrences/);
  assert.equal(result.dimensions.schemaConformance.status, "passed");
  assert.equal(result.score, null);
});

test("handles zero records and zero attributes without inventing percentages", () => {
  const parsed = parseArff("@relation empty\n@attribute x numeric\n@data");
  const analysis = analyzeDataset(parsed.dataset);
  const emptyRows = evaluateDataQuality({ dataset: parsed.dataset, analysis, statisticalProfile: analysis.statisticalProfile, rules: [] });
  assert.equal(emptyRows.dimensions.completeness.status, "unavailable");
  assert.equal(emptyRows.dimensions.completeness.missingPercentage, null);
  assert.equal(emptyRows.dimensions.uniqueness.duplicatePercentage, null);
  const zeroAttributes = { relation: "empty", attributes: [], records: [] };
  const emptyAnalysis = analyzeDataset(zeroAttributes);
  const emptySchema = evaluateDataQuality({ dataset: zeroAttributes, analysis: emptyAnalysis, statisticalProfile: emptyAnalysis.statisticalProfile, rules: [] });
  assert.equal(emptySchema.dimensions.schemaConformance.status, "unavailable");
  assert.equal(emptySchema.dimensions.completeness.totalCells, 0);
});

test("distinguishes parser errors from type violations", () => {
  const fixture = dataset("@relation bad\n@attribute n numeric\n@data\nno");
  const invalid = evaluateDataQuality({ dataset: fixture.dataset, analysis: fixture.analysis, statisticalProfile: fixture.profile, parserErrors: [{ code: "MALFORMED_DATA", section: "data", line: 4 }], rules: [] });
  assert.equal(invalid.dimensions.validity.parserErrorCount, 1);
  assert.equal(invalid.dimensions.validity.typeViolationCount, 1);
  assert.deepEqual(invalid.dimensions.validity.affectedAttributeNames, ["n"]);
  assert.deepEqual(invalid.dimensions.validity.affectedSourceLines, [4]);
});

test("evaluates every supported rule type with passing and failing examples", () => {
  const fixtures = dataset(source);
  const definitions = [
    rule("required", "required_value", "number", {}),
    rule("missing", "max_missing_percentage", "number", { threshold: 10 }),
    rule("range", "numeric_range", "number", { minimum: 0, maximum: 5 }),
    rule("unique", "unique_values", "number", {}),
    rule("allowed", "allowed_values", "color", { values: ["red"] }),
    rule("length", "string_length", "name", { minimum: 2, maximum: 5 }),
    rule("rows", "row_count", null, { minimum: 6, maximum: 10 })
  ];
  const result = evaluateDataQuality({ dataset: fixtures.dataset, analysis: fixtures.analysis, statisticalProfile: fixtures.profile, rules: definitions });
  assert.deepEqual(result.ruleResults.map((entry) => entry.status), ["failed", "failed", "failed", "failed", "failed", "failed", "failed"]);
  assert.deepEqual(result.ruleResults.map((entry) => entry.failureCount), [1, 1, 1, 2, 1, 2, 1]);

  const passFixture = dataset(`@relation pass
@attribute number numeric
@attribute name string
@attribute color {red,blue}
@data
1,A,red
2,B,blue
3,C,red
4,D,blue`);
  const passRules = [
    rule("required-pass", "required_value", "color", {}),
    rule("missing-pass", "max_missing_percentage", "number", { threshold: 0 }),
    rule("range-pass", "numeric_range", "number", { minimum: 1, maximum: 4 }),
    rule("unique-pass", "unique_values", "name", {}),
    rule("allowed-pass", "allowed_values", "color", { values: ["red", "blue"] }),
    rule("length-pass", "string_length", "name", { minimum: 1, maximum: 1 }),
    rule("rows-pass", "row_count", null, { minimum: 4 })
  ];
  const passed = evaluateDataQuality({ dataset: passFixture.dataset, analysis: passFixture.analysis, statisticalProfile: passFixture.profile, rules: passRules });
  assert.ok(passed.ruleResults.every((entry) => entry.status === "passed"));
});

test("honors inclusive and exclusive numeric boundaries and rejects invalid values", () => {
  const fixture = dataset("@relation bounds\n@attribute n integer\n@data\n1\n2\n3\nnotint");
  const inclusive = rule("inclusive", "numeric_range", "n", { minimum: 1, maximum: 3 });
  const exclusive = rule("exclusive", "numeric_range", "n", { minimum: 1, maximum: 3, inclusiveMinimum: false, inclusiveMaximum: false });
  const result = evaluateDataQuality({ dataset: fixture.dataset, analysis: fixture.analysis, statisticalProfile: fixture.profile, rules: [inclusive, exclusive] });
  assert.equal(result.ruleResults[0].failureCount, 1);
  assert.equal(result.ruleResults[0].failureDetails[0].value, "notint");
  assert.equal(result.ruleResults[1].failureCount, 3);
});

test("uses missing markers but preserves quoted literal question marks in rules", () => {
  const fixture = dataset('@relation question\n@attribute text string\n@data\n?\n"?"\nother');
  const result = evaluateDataQuality({ dataset: fixture.dataset, analysis: fixture.analysis, statisticalProfile: fixture.profile, rules: [rule("allowed", "allowed_values", "text", { values: ["?"] }), rule("unique", "unique_values", "text", {})] });
  assert.equal(result.dimensions.completeness.missingCount, 1);
  assert.equal(result.ruleResults[0].failureCount, 1);
  assert.equal(result.ruleResults[0].failureDetails[0].value, "other");
  assert.equal(result.ruleResults[1].failureCount, 0);
});

test("rejects invalid limits, duplicate identifiers, incompatible attribute types, and invalid bounds", () => {
  const fixture = dataset(source);
  const invalid = [
    rule("dup", "numeric_range", "name", { minimum: 0 }),
    rule("dup", "allowed_values", "number", { values: ["a"] }),
    rule("bad-threshold", "max_missing_percentage", "number", { threshold: 101 }),
    rule("bad-range", "numeric_range", "number", { minimum: 5, maximum: 1 }),
    rule("bad-string", "string_length", "name", { minimum: -1, maximum: 4 })
  ];
  const response = evaluateDataQuality({ dataset: fixture.dataset, analysis: fixture.analysis, statisticalProfile: fixture.profile, rules: invalid });
  assert.equal(response.configurationValid, false);
  assert.ok(response.errors.length >= 6);
  const invalidTypedList = evaluateDataQuality({ dataset: fixture.dataset, analysis: fixture.analysis, statisticalProfile: fixture.profile, rules: [rule("bad-list", "allowed_values", "number", { values: ["not numeric"] })] });
  assert.equal(invalidTypedList.configurationValid, false);
  assert.equal(validateQualityRules(Array.from({ length: 51 }, (_, index) => rule(`r${index}`, "row_count", null, { minimum: 0 })), fixture.dataset.attributes).valid, false);
});

test("reports disabled and no-record rules as skipped and aggregates severity", () => {
  const fixture = dataset(source);
  const rules = [rule("a", "required_value", "number", {}, { severity: "error" }), rule("b", "row_count", null, { minimum: 10 }, { severity: "warning" }), rule("c", "row_count", null, { minimum: 0 }, { enabled: false, severity: "informational" })];
  const result = evaluateDataQuality({ dataset: fixture.dataset, analysis: fixture.analysis, statisticalProfile: fixture.profile, rules });
  assert.deepEqual(result.summary.failureCountBySeverity, { error: 1, warning: 1, informational: 0 });
  assert.equal(result.summary.skippedRuleCount, 1);
  assert.equal(result.ruleResults[2].status, "skipped");
});

test("bounds failure details while preserving accurate counts", () => {
  const records = Array.from({ length: 10000 }, (_, index) => ({ index, values: [null] }));
  const dataset = { relation: "large", attributes: [{ index: 0, name: "required", type: "string" }], records };
  const analysis = analyzeDataset(dataset);
  const result = evaluateDataQuality({ dataset, analysis, statisticalProfile: analysis.statisticalProfile, rules: [rule("required", "required_value", "required", {})] });
  assert.equal(result.ruleResults[0].failureCount, 10000);
  assert.equal(result.ruleResults[0].failureDetails.length, FAILURE_DETAIL_LIMIT);
  assert.equal(result.ruleResults[0].detailsTruncated, true);
});
