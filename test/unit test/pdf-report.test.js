import assert from "node:assert/strict";
import test from "node:test";
import { buildPdfReportData, getPdfFilename } from "../frontend/src/components/pdfReportData.js";
import { createAnalysisPdf } from "../frontend/src/components/exportPdf.js";

const analysis = {
  file: { name: "weather.arff", size: 2048 },
  relation: "weather data",
  summary: { instanceCount: 4, attributeCount: 2, missingValueCount: 1, duplicateRecordCount: 1 },
  attributeTypeCounts: { numeric: 1, nominal: 1, string: 0, date: 0 },
  attributes: [
    { index: 0, name: "temperature", type: "numeric", nominalValues: [], missingCount: 1 },
    { index: 1, name: "class", type: "nominal", nominalValues: ["sunny", "rainy"], missingCount: 0 }
  ],
  missingValues: { total: 1, byAttribute: [{ index: 0, name: "temperature", count: 1 }] },
  duplicates: [{ recordIndices: [0, 2], duplicateRecordCount: 1 }],
  typeViolations: [{ recordIndex: 3, attributeName: "temperature", value: "hot", sourceLine: 9, message: "Invalid numeric value." }]
};

test("generates a safe PDF filename", () => {
  assert.equal(getPdfFilename("weather data/2026"), "weather-data-2026-analysis-report.pdf");
  assert.equal(getPdfFilename(""), "arff-analysis-report.pdf");
});

test("builds PDF report data with violations and duplicates", () => {
  const result = buildPdfReportData(analysis, "now");
  assert.equal(result.title, "ARFF File Analysis Report");
  assert.equal(result.generatedAt, "now");
  assert.equal(result.typeViolations.length, 1);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.duplicates[0].recordIndices, [0, 2]);
  assert.equal(result.charts.attributeTypes[0].value, 1);
});

test("preserves structured parser errors for the PDF report", () => {
  const result = buildPdfReportData({ ...analysis, errors: [{ code: "MISSING_DATA", line: 8, section: "header", message: "Missing @data." }] }, "now");
  assert.deepEqual(result.errors, [{ code: "MISSING_DATA", line: 8, section: "header", message: "Missing @data." }]);
});

test("creates a PDF for valid analysis data", () => {
  const { doc, filename } = createAnalysisPdf(analysis, "now");
  assert.equal(filename, "weather-data-analysis-report.pdf");
  assert.ok(doc.output("arraybuffer").byteLength > 0);
});

test("empty and long attribute lists do not crash PDF creation", () => {
  const empty = createAnalysisPdf({ relation: "empty", file: {}, summary: {}, attributeTypeCounts: {}, attributes: [], missingValues: {}, duplicates: [], typeViolations: [] }, "now");
  assert.ok(empty.doc.output("arraybuffer").byteLength > 0);

  const long = { ...analysis, attributes: Array.from({ length: 80 }, (_, index) => ({ index, name: `attribute-${index}`, type: "string", nominalValues: [], missingCount: 0 })), missingValues: { byAttribute: [] } };
  const longPdf = createAnalysisPdf(long, "now");
  assert.ok(longPdf.doc.output("arraybuffer").byteLength > 0);
});

test("normalizes sparse analysis results and supplies safe defaults", () => {
  const result = buildPdfReportData({}, "fixed");
  assert.equal(result.generatedAt, "fixed");
  assert.deepEqual(result.file, { name: "Unknown", size: 0, relation: "Unknown" });
  assert.deepEqual(result.summary, { instanceCount: 0, attributeCount: 0, missingValueCount: 0, duplicateRecordCount: 0 });
  assert.deepEqual(result.attributes, []);
  assert.equal(result.typeViolations.length, 0);
});

test("sanitizes empty and punctuation-only relation names", () => {
  assert.equal(getPdfFilename("///"), "arff-analysis-report.pdf");
  assert.equal(getPdfFilename("  sales & data  "), "sales-data-analysis-report.pdf");
});
