import { jsPDF } from "jspdf";
import { buildPdfReportData, getPdfFilename } from "./pdfReportData.js";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function textValue(value) {
  return value === null || value === undefined ? "?" : String(value);
}

export function createAnalysisPdf(analysisResult, generatedAt) {
  const report = buildPdfReportData(analysisResult, generatedAt);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  const addPageIfNeeded = (height = 20) => {
    if (y + height <= PAGE_HEIGHT - MARGIN) return;
    doc.addPage();
    y = MARGIN;
  };

  const heading = (title, size = 13) => {
    addPageIfNeeded(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(30, 58, 138);
    doc.text(title, MARGIN, y);
    y += size + 9;
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
  };

  const paragraph = (value, options = {}) => {
    const lines = doc.splitTextToSize(String(value), options.width || CONTENT_WIDTH);
    addPageIfNeeded(lines.length * 13 + 4);
    doc.setFontSize(options.size || 9);
    doc.setTextColor(71, 85, 105);
    doc.text(lines, options.x || MARGIN, y);
    y += lines.length * 13 + (options.gap ?? 5);
  };

  const table = (headers, rows, widths) => {
    const rowHeight = (cells, header = false) => {
      const lineCounts = cells.map((cell, index) => doc.splitTextToSize(textValue(cell), widths[index] - 10).length);
      return Math.max(header ? 20 : 18, Math.max(...lineCounts, 1) * 11 + 8);
    };
    const drawRow = (cells, header = false) => {
      const height = rowHeight(cells, header);
      addPageIfNeeded(height);
      let x = MARGIN;
      doc.setFillColor(...(header ? [224, 242, 254] : [255, 255, 255]));
      doc.setDrawColor(186, 230, 253);
      doc.rect(MARGIN, y - 12, widths.reduce((sum, width) => sum + width, 0), height, "FD");
      cells.forEach((cell, index) => {
        const lines = doc.splitTextToSize(textValue(cell), widths[index] - 10);
        doc.setFont("helvetica", header ? "bold" : "normal");
        doc.setFontSize(header ? 8 : 8);
        doc.setTextColor(71, 85, 105);
        doc.text(lines, x + 5, y + 1);
        x += widths[index];
      });
      y += height;
    };
    drawRow(headers, true);
    rows.forEach((row) => drawRow(row));
    y += 8;
  };

  const barChart = (title, data, color) => {
    heading(title, 11);
    if (!data.length) {
      paragraph("No data available.");
      return;
    }
    const chartHeight = 105;
    const chartWidth = CONTENT_WIDTH;
    const max = Math.max(1, ...data.map((entry) => entry.value));
    const slot = chartWidth / data.length;
    const barWidth = Math.max(8, Math.min(42, slot * 0.55));
    addPageIfNeeded(chartHeight + 25);
    const baseline = y + chartHeight;
    doc.setDrawColor(148, 163, 184);
    doc.line(MARGIN, baseline, MARGIN + chartWidth, baseline);
    data.forEach((entry, index) => {
      const height = (entry.value / max) * chartHeight;
      const x = MARGIN + slot * index + (slot - barWidth) / 2;
      doc.setFillColor(...color);
      doc.rect(x, baseline - height, barWidth, Math.max(1, height), "F");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(String(entry.value), x + barWidth / 2, baseline - height - 4, { align: "center" });
      const label = doc.splitTextToSize(entry.label, Math.max(slot - 4, 30));
      doc.text(label, x + barWidth / 2, baseline + 12, { align: "center" });
    });
    y = baseline + 34;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(30, 58, 138);
  doc.text(report.title, MARGIN, y);
  y += 28;
  paragraph(`Generated: ${report.generatedAt}`);
  paragraph(`File: ${report.file.name} | Size: ${formatBytes(report.file.size)} | Relation: ${report.file.relation}`);

  heading("Dataset statistics");
  table(["Instances", "Attributes", "Missing values", "Duplicate records"], [[
    report.summary.instanceCount,
    report.summary.attributeCount,
    report.summary.missingValueCount,
    report.summary.duplicateRecordCount
  ]], [CONTENT_WIDTH / 4, CONTENT_WIDTH / 4, CONTENT_WIDTH / 4, CONTENT_WIDTH / 4]);

  heading("Attribute type counts");
  table(["Numeric", "Nominal", "String", "Date"], [[
    report.attributeTypeCounts.numeric || 0,
    report.attributeTypeCounts.nominal || 0,
    report.attributeTypeCounts.string || 0,
    report.attributeTypeCounts.date || 0
  ]], [CONTENT_WIDTH / 4, CONTENT_WIDTH / 4, CONTENT_WIDTH / 4, CONTENT_WIDTH / 4]);

  heading("Attribute information");
  table(["Index", "Name", "Type", "Nominal values", "Missing"], report.attributes.map((attribute) => [
    attribute.index,
    attribute.name,
    attribute.type,
    attribute.nominalValues.join(", ") || "—",
    attribute.missingCount
  ]), [42, 125, 80, 210, 58]);

  heading("Missing-value summary");
  paragraph(`Total missing values: ${report.missingValues.total}`);
  table(["Attribute", "Missing values"], report.missingValues.byAttribute.map((entry) => [entry.name, entry.count]), [CONTENT_WIDTH - 130, 130]);

  heading("Duplicate-record summary");
  paragraph(`Duplicate records: ${report.summary.duplicateRecordCount}`);
  table(["Record indices", "Repeated occurrences"], report.duplicates.map((group) => [group.recordIndices.join(", ") || "—", group.duplicateRecordCount]), [CONTENT_WIDTH - 150, 150]);

  heading("Type-validation results");
  if (!report.typeViolations.length) paragraph("No type violations.");
  else table(["Record", "Attribute", "Value", "Line", "Message"], report.typeViolations.map((violation) => [violation.recordIndex, violation.attributeName, textValue(violation.value), violation.sourceLine ?? "—", violation.message]), [48, 100, 80, 45, CONTENT_WIDTH - 273]);

  heading("Parsing and syntax errors");
  if (!report.errors.length) paragraph("No parsing or syntax errors.");
  else table(["Line", "Section", "Code", "Message"], report.errors.map((error) => [error.line ?? "—", error.section, error.code, error.message]), [45, 85, 125, CONTENT_WIDTH - 255]);

  barChart("Attribute type distribution", report.charts.attributeTypes, [37, 99, 235]);
  barChart("Missing values per attribute", report.charts.missingValues, [249, 115, 22]);

  return { doc, filename: getPdfFilename(report.file.relation) };
}

export function exportAnalysisPdf(analysisResult, generatedAt) {
  const { doc, filename } = createAnalysisPdf(analysisResult, generatedAt);
  doc.save(filename);
  return filename;
}
