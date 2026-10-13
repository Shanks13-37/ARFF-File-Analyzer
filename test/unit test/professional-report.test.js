import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReportData,
  DEFAULT_REPORT_SECTIONS,
  getUnavailableReportSections,
  sanitizeReportFilename
} from "../../frontend/src/components/reportBuilderData.js";
import { createProfessionalReportPdf } from "../../frontend/src/components/professionalReportPdf.js";

function makeResult(name, offset = 0) {
  return {
    file: { name },
    valid: true,
    relation: "fixture",
    summary: { instanceCount: 2, attributeCount: 1, missingValueCount: 1, duplicateRecordCount: 0 },
    attributes: [{ index: 0, name: "amount", type: "numeric", nominalValues: [] }],
    records: [
      { index: 0, values: [String(1 + offset)], quotedValues: [false] },
      { index: 1, values: [null], quotedValues: [false] }
    ],
    statisticalProfile: { attributes: [] },
    qualityAssessment: { dimensions: { completeness: { status: "passed" } }, ruleResults: [] },
    attributeTypeCounts: { numeric: 1 },
    missingValues: { total: 1, byAttribute: [{ name: "amount", count: 1 }] },
    duplicates: [],
    errors: [],
    typeViolations: []
  };
}

test("report data includes only explicitly selected dataset keys", () => {
  const report = buildReportData({
    datasets: [
      { key: "a", fileName: "a.arff", result: makeResult("a.arff") },
      { key: "b", fileName: "b.arff", result: makeResult("b.arff", 50) }
    ],
    selectedKeys: ["b"],
    sections: { ...DEFAULT_REPORT_SECTIONS, visualExploration: false }
  });
  assert.deepEqual(report.datasets.map((dataset) => dataset.key), ["b"]);
  assert.equal(report.datasets[0].result.records[0].values[0], "51");
});

test("section choices control content and optional record samples are bounded", () => {
  const source = makeResult("sample.arff");
  source.records = Array.from({ length: 30 }, (_, index) => ({ index, values: [String(index)], quotedValues: [false] }));
  const report = buildReportData({
    datasets: [{ key: "sample", result: source }],
    selectedKeys: ["sample"],
    sections: { ...DEFAULT_REPORT_SECTIONS, overview: false, recordSample: true },
    sampleLimit: 999
  });
  assert.equal(report.sections.overview, false);
  assert.equal(report.datasets[0].recordSample.records.length, 20);
  assert.equal(report.datasets[0].recordSample.totalRecords, 30);
  assert.equal(report.datasets[0].recordSample.truncated, true);
  assert.equal(source.records.length, 30);
});

test("sample mapping preserves missing values and quoted literal question marks", () => {
  const source = makeResult("markers.arff");
  source.attributes.push({ index: 1, name: "label", type: "string", nominalValues: [] });
  source.records[0].values.push("?");
  source.records[0].quotedValues.push(true);
  source.records[1].values.push(null);
  source.records[1].quotedValues.push(false);
  const report = buildReportData({
    datasets: [{ key: "markers", result: source }],
    selectedKeys: ["markers"],
    sections: { ...DEFAULT_REPORT_SECTIONS, recordSample: true }
  });
  const rows = report.datasets[0].recordSample.records;
  assert.equal(rows[0].values[1], "?");
  assert.equal(rows[0].quotedValues[1], true);
  assert.equal(rows[1].values[1], null);
  assert.equal(rows[1].quotedValues[1], false);
});

test("quality overrides map to the chosen dataset and missing content is disclosed", () => {
  const replacement = { dimensions: { ruleCompliance: { status: "failed" } }, ruleResults: [{ name: "fresh", status: "failed" }] };
  const report = buildReportData({
    datasets: [{ key: "x", result: makeResult("x.arff") }],
    selectedKeys: ["x"], qualityOverrides: { x: replacement }, ruleEvaluationErrors: { x: "service unavailable" }
  });
  assert.equal(report.datasets[0].qualityAssessment, replacement);
  assert.equal(report.datasets[0].ruleEvaluationError, "service unavailable");
  assert.ok(getUnavailableReportSections(report).some((entry) => entry.section === "Custom quality-rule results"));
});

test("filename sanitization and PDF pagination work for long reports", () => {
  assert.equal(sanitizeReportFilename(" /Unsafe report:* "), "Unsafe-report.pdf");
  assert.equal(sanitizeReportFilename("///"), "arff-analysis-report.pdf");
  const result = makeResult("long.arff");
  result.attributes = Array.from({ length: 90 }, (_, index) => ({ index, name: "attribute_" + index + "_with_a_long_schema_name", type: "string", nominalValues: [] }));
  result.summary.attributeCount = result.attributes.length;
  const report = buildReportData({ datasets: [{ key: "long", result }], selectedKeys: ["long"] });
  const { doc } = createProfessionalReportPdf(report);
  assert.ok(doc.getNumberOfPages() > 1);
  assert.ok(doc.output("arraybuffer").byteLength > 0);
});

test("empty or unavailable selections fail explicitly rather than creating an empty PDF", () => {
  assert.throws(() => createProfessionalReportPdf({ datasets: [] }), /Select at least one/);
});
