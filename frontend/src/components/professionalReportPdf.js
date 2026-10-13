import { jsPDF } from "jspdf";
import { sanitizeReportFilename } from "./reportBuilderData.js";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TOP = 58;
const BOTTOM = PAGE_HEIGHT - 48;
const LINE_HEIGHT = 11;
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
const percentFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function display(value) {
  if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) return "Unavailable";
  return typeof value === "number" ? numberFormat.format(value) : String(value);
}

function percent(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "Unavailable"
    : percentFormat.format(Number(value)) + "%";
}

function compact(value, limit = 450) {
  const text = String(value ?? "—").replace(/\u0000/g, "").replace(/\r\n?/g, "\n");
  return text.length > limit ? text.slice(0, limit) + " … [truncated]" : text;
}

function assessmentStatus(status) {
  const labels = { passed: "Passed", failed: "Failed", unavailable: "Unavailable", skipped: "Skipped" };
  return labels[status] || "Unavailable";
}

function reportTime(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value || "Unavailable") : parsed.toLocaleString();
}

export function createProfessionalReportPdf(report) {
  if (!report?.datasets?.length) throw new Error("Select at least one analyzed dataset before generating a report.");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.setProperties({
    title: compact(report.metadata.title, 120),
    subject: "ARFF data analysis and quality assessment report",
    author: compact(report.metadata.author || "ARFF File Analyzer", 120)
  });
  let y = TOP;
  let pageDataset = "Report overview";
  const pageLabels = new Map([[1, pageDataset]]);

  function addPage(label = pageDataset) {
    doc.addPage();
    y = TOP;
    pageDataset = label;
    pageLabels.set(doc.getNumberOfPages(), label);
  }

  function ensure(height) {
    if (y + height > BOTTOM) addPage();
  }

  function paragraph(value, options = {}) {
    const x = options.x ?? MARGIN;
    const width = options.width ?? CONTENT_WIDTH;
    const size = options.size ?? 9;
    doc.setFont("helvetica", options.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(71, 85, 105);
    const lines = doc.splitTextToSize(compact(value, options.limit ?? 2400), width);
    let index = 0;
    while (index < lines.length) {
      if (y + LINE_HEIGHT > BOTTOM) addPage();
      const available = Math.max(1, Math.floor((BOTTOM - y) / LINE_HEIGHT));
      const chunk = lines.slice(index, index + available);
      doc.text(chunk, x, y);
      y += chunk.length * LINE_HEIGHT + 2;
      index += chunk.length;
      if (index < lines.length) addPage();
    }
    y += options.gap ?? 5;
  }

  function heading(title, reserve = 24, size = 13) {
    ensure(size + 12 + reserve);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(30, 58, 138);
    doc.text(compact(title, 180), MARGIN, y);
    y += size + 8;
    doc.setFont("helvetica", "normal");
  }

  function drawTable(headers, rows, widths, options = {}) {
    const fontSize = options.fontSize ?? 7.5;
    const maxLines = options.maxLines ?? 24;
    const cellLines = (cell, width, isHeader) => {
      const lines = doc.splitTextToSize(compact(cell, options.cellLimit ?? 700), Math.max(20, width - 8));
      if (lines.length <= maxLines) return lines;
      return [...lines.slice(0, maxLines - 1), "… [truncated]"];
    };
    const rowHeight = (cells, isHeader) => Math.max(isHeader ? 22 : 18, ...cells.map((cell, index) => cellLines(cell, widths[index], isHeader).length * (fontSize + 2) + 8));
    const drawRow = (cells, isHeader) => {
      const height = rowHeight(cells, isHeader);
      ensure(height);
      if (y + height > BOTTOM) return false;
      let x = MARGIN;
      doc.setFillColor(...(isHeader ? [224, 242, 254] : [255, 255, 255]));
      doc.setDrawColor(203, 213, 225);
      doc.rect(MARGIN, y - 12, widths.reduce((sum, value) => sum + value, 0), height, "FD");
      cells.forEach((cell, index) => {
        const lines = cellLines(cell, widths[index], isHeader);
        doc.setFont("helvetica", isHeader ? "bold" : "normal");
        doc.setFontSize(fontSize);
        doc.setTextColor(51, 65, 85);
        doc.text(lines, x + 4, y + 1);
        x += widths[index];
      });
      y += height;
      return true;
    };
    const drawHeader = () => drawRow(headers, true);
    drawHeader();
    rows.forEach((row) => {
      const height = rowHeight(row, false);
      if (y + height > BOTTOM) {
        addPage();
        drawHeader();
      }
      if (!drawRow(row, false)) {
        addPage();
        drawHeader();
        drawRow(row, false);
      }
    });
    y += 7;
  }

  function statusTable(items) {
    drawTable(["Quality dimension", "Status", "Result and interpretation"], items, [112, 72, CONTENT_WIDTH - 184], { fontSize: 8, cellLimit: 550 });
  }

  function barChart(title, data) {
    heading(title, 170, 11);
    if (!data?.length) {
      paragraph("No data is available for this chart.");
      return;
    }
    const chartHeight = 112;
    ensure(chartHeight + 35);
    const baseline = y + chartHeight;
    const left = MARGIN + 20;
    const chartWidth = CONTENT_WIDTH - 32;
    const max = Math.max(1, ...data.map((item) => Number(item.value) || 0));
    const slot = chartWidth / data.length;
    const barWidth = Math.max(5, Math.min(32, slot * 0.58));
    doc.setDrawColor(148, 163, 184);
    doc.line(left, baseline, left + chartWidth, baseline);
    data.forEach((item, index) => {
      const value = Math.max(0, Number(item.value) || 0);
      const height = value / max * 88;
      const x = left + index * slot + (slot - barWidth) / 2;
      doc.setFillColor(37, 99, 235);
      doc.rect(x, baseline - height, barWidth, Math.max(1, height), "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);
      doc.text(String(value), x + barWidth / 2, baseline - height - 3, { align: "center" });
      const label = compact(item.label, 32).replace(/\n/g, " ");
      doc.text(doc.splitTextToSize(label, Math.max(22, slot - 2)).slice(0, 2), x + barWidth / 2, baseline + 10, { align: "center" });
    });
    y = baseline + 27;
  }

  function addUnavailability(label, reason) {
    paragraph(label + ": " + reason, { size: 8, gap: 3 });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(30, 58, 138);
  doc.text(doc.splitTextToSize(compact(report.metadata.title, 130), CONTENT_WIDTH), MARGIN, y);
  y += 32;
  paragraph("Generated: " + reportTime(report.metadata.generatedAt));
  if (report.metadata.author) paragraph("Prepared by: " + compact(report.metadata.author, 140));
  if (report.metadata.description) paragraph(report.metadata.description, { size: 10, gap: 8 });
  paragraph("Included datasets and original analysis counts:", { bold: true });
  drawTable(["Dataset", "ARFF validation", "Records", "Attributes"], report.datasets.map((dataset) => {
    const result = dataset.result;
    return [
      dataset.fileName,
      result.valid === true ? "Valid" : result.valid === false ? "Validation issues" : "Unavailable",
      result.summary?.instanceCount ?? result.records?.length ?? "Unavailable",
      result.summary?.attributeCount ?? result.attributes?.length ?? "Unavailable"
    ];
  }), [230, 105, 75, CONTENT_WIDTH - 410], { fontSize: 8, cellLimit: 300 });
  if (report.sections.executiveSummary) {
    heading("Executive summary", 58);
    paragraph("This report consolidates parsed ARFF analysis for " + report.datasets.length + " selected dataset(s). ARFF parsing/type validity, statistical observations, and user-configured rule results are reported separately; report generation itself does not imply that a dataset passed validation.");
    drawTable(["Dataset", "Missing values", "Duplicate occurrences", "Quality rule failures"], report.datasets.map((dataset) => [
      dataset.fileName,
      dataset.result.summary?.missingValueCount ?? "Unavailable",
      dataset.result.summary?.duplicateRecordCount ?? "Unavailable",
      dataset.ruleEvaluationError ? "Unavailable (not evaluated)" : dataset.qualityAssessment?.summary?.failedRuleCount ?? "Unavailable"
    ]), [180, 95, 115, CONTENT_WIDTH - 390], { fontSize: 8, cellLimit: 250 });
  }

  report.datasets.forEach((dataset) => {
    addPage(dataset.fileName);
    const result = dataset.result;
    const attributes = Array.isArray(result.attributes) ? result.attributes : [];
    const records = Array.isArray(result.records) ? result.records : [];
    const quality = dataset.qualityAssessment;
    heading(dataset.fileName, 55, 17);
    paragraph("Relation: " + compact(result.relation || "Unavailable", 150) + " · ARFF validation: " + (result.valid === true ? "valid" : result.valid === false ? "issues found" : "unavailable"));
    paragraph("Parsed records: " + display(result.summary?.instanceCount ?? records.length) + " · Declared attributes: " + display(result.summary?.attributeCount ?? attributes.length));

    if (report.sections.overview) {
      heading("Dataset overview and schema", 35);
      if (!attributes.length) paragraph("No parsed attributes are available.");
      else drawTable(["Index", "Attribute", "Type", "Declared values / date format"], attributes.map((attribute, index) => [
        attribute.index ?? index,
        attribute.name || "Unnamed",
        attribute.type || "Unknown",
        attribute.type === "nominal" ? (attribute.nominalValues || []).join(", ") : attribute.dateFormat || "—"
      ]), [42, 145, 80, CONTENT_WIDTH - 267], { fontSize: 7.5 });
      paragraph("Declared schema attributes come from the parsed ARFF header; parsed record counts include only rows accepted by the parser.", { size: 8 });
    }

    if (report.sections.validation) {
      heading("Parsing and validation results", 35);
      paragraph("ARFF parser/type validity: " + (result.valid === true ? "Valid" : result.valid === false ? "Validation issues found" : "Unavailable") + ". This is separate from custom rule compliance.");
      const errors = Array.isArray(result.errors) ? result.errors : [];
      const violations = Array.isArray(result.typeViolations) ? result.typeViolations : [];
      paragraph("Parser/syntax errors: " + errors.length + " · Attribute type violations: " + violations.length);
      if (errors.length) {
        heading("Parser and syntax diagnostics", 25, 10);
        drawTable(["Line", "Section", "Code", "Diagnostic"], errors.slice(0, 300).map((entry) => [entry.line ?? "—", entry.section || "—", entry.code || "—", entry.message || ""]), [42, 76, 105, CONTENT_WIDTH - 223], { fontSize: 7.5 });
        if (errors.length > 300) paragraph("Showing 300 of " + errors.length + " parser errors.", { bold: true });
      } else paragraph("No parser/syntax errors were reported.");
      if (violations.length) {
        heading("Attribute type violations", 25, 10);
        drawTable(["Record", "Attribute", "Value", "Source line", "Message"], violations.slice(0, 300).map((entry) => [
          entry.recordIndex ?? "—", entry.attributeName || "—", entry.value === null || entry.value === undefined ? "?" : entry.value, entry.sourceLine ?? "—", entry.message || "Invalid value"
        ]), [42, 95, 90, 54, CONTENT_WIDTH - 281], { fontSize: 7.2, cellLimit: 450 });
        if (violations.length > 300) paragraph("Showing 300 of " + violations.length + " type violations.", { bold: true });
      } else paragraph("No attribute type violations were reported.");
    }

    if (report.sections.qualityOverview) {
      heading("Data-quality overview", 45);
      if (!quality?.dimensions) addUnavailability("Quality overview", "No quality assessment is available for this dataset.");
      else {
        const dimensions = quality.dimensions;
        const completeness = dimensions.completeness || {};
        const validity = dimensions.validity || {};
        const uniqueness = dimensions.uniqueness || {};
        const schema = dimensions.schemaConformance || {};
        const rules = dimensions.ruleCompliance || {};
        statusTable([
          ["Completeness", assessmentStatus(completeness.status), (completeness.missingCount ?? "Unavailable") + " missing / " + (completeness.totalCells ?? "Unavailable") + " cells; " + percent(completeness.missingPercentage) + " missing"],
          ["Validity", assessmentStatus(validity.status), (validity.parserErrorCount ?? "Unavailable") + " parser errors and " + (validity.typeViolationCount ?? "Unavailable") + " type violations"],
          ["Uniqueness", assessmentStatus(uniqueness.status), (uniqueness.duplicateRecordCount ?? "Unavailable") + " repeated occurrences in " + (uniqueness.duplicateGroupCount ?? "Unavailable") + " groups; " + percent(uniqueness.duplicatePercentage)],
          ["Schema conformance", assessmentStatus(schema.status), schema.explanation || "Schema assessment unavailable"],
          ["Rule compliance", assessmentStatus(rules.status), dataset.ruleEvaluationError ? "Unavailable; current rules were not evaluated." : (rules.passedRuleCount ?? 0) + " passed · " + (rules.failedRuleCount ?? 0) + " failed · " + (rules.skippedRuleCount ?? 0) + " skipped"]
        ]);
        paragraph("No aggregate quality score is reported. Quality dimensions are independent and may describe the same records from different perspectives.", { size: 8 });
      }
    }

    if (report.sections.qualityMetrics) {
      heading("Quality metrics and missing-value analysis", 30);
      const completeness = quality?.dimensions?.completeness;
      if (completeness?.attributes?.length) {
        drawTable(["Attribute", "Missing", "Records", "Complete"], completeness.attributes.map((entry) => [
          entry.attributeName, entry.missingCount, entry.totalRecords, percent(entry.completenessPercentage)
        ]), [205, 80, 85, CONTENT_WIDTH - 370], { fontSize: 8 });
        paragraph("Overall missing percentage denominator: all parsed record-attribute cells. Per-attribute completeness denominator: parsed records.", { size: 8 });
      } else addUnavailability("Completeness detail", "Per-attribute completeness is unavailable.");
      const validity = quality?.dimensions?.validity;
      if (validity) paragraph("Validity details: " + validity.parserErrorCount + " syntactic/parser errors; " + validity.typeViolationCount + " value-level type violations; " + validity.affectedRecordCount + " records and " + validity.affectedAttributeCount + " attributes affected by known type violations.", { size: 8 });
      else paragraph("Validity dimension unavailable.");
      paragraph("Missing-value total from analysis: " + display(result.missingValues?.total ?? result.summary?.missingValueCount), { size: 8 });
    }

    if (report.sections.duplicates) {
      heading("Duplicate-record analysis", 35);
      const duplicateCount = result.summary?.duplicateRecordCount;
      const groups = Array.isArray(result.duplicates) ? result.duplicates : [];
      paragraph("Repeated record occurrences after the first: " + display(duplicateCount) + " · duplicate groups: " + groups.length + " · parsed record denominator: " + display(result.summary?.instanceCount ?? records.length));
      if (!groups.length) paragraph("No duplicate groups were reported.");
      else {
        drawTable(["Record indices in group", "Repeated occurrences"], groups.slice(0, 200).map((group) => [
          (group.recordIndices || []).join(", "), group.duplicateRecordCount
        ]), [CONTENT_WIDTH - 130, 130], { fontSize: 8 });
        if (groups.length > 200) paragraph("Showing 200 of " + groups.length + " duplicate groups; the summary count above remains complete.", { bold: true });
      }
    }

    if (report.sections.profiling) {
      heading("Statistical profiling", 40);
      const profile = result.statisticalProfile;
      const profiles = Array.isArray(profile?.attributes) ? profile.attributes : [];
      if (!profiles.length) addUnavailability("Statistical profile", "No attribute profiles are available.");
      else {
        paragraph("Numeric variance is population-based; quartiles and percentiles use linear interpolation at (n − 1) × p. Outliers use the 1.5 × IQR fences.", { size: 8 });
        drawTable(["Attribute", "Type", "Total", "Valid", "Invalid", "Missing (%)", "Distinct"], profiles.map((entry) => [
          entry.name, entry.type, entry.totalRecords, entry.validValueCount, entry.invalidValueCount, entry.missingCount + " (" + percent(entry.missingPercentage) + ")", entry.distinctValueCount
        ]), [112, 58, 48, 48, 48, 104, CONTENT_WIDTH - 418], { fontSize: 7.5 });
        const numericProfiles = profiles.filter((entry) => entry.statistics);
        if (numericProfiles.length) {
          heading("Numeric statistics", 36, 10);
          drawTable(["Attribute", "Minimum", "Maximum", "Range", "Mean", "Median", "Variance", "Std. dev."], numericProfiles.map((entry) => [
            entry.name, entry.statistics.minimum, entry.statistics.maximum, entry.statistics.range, entry.statistics.mean, entry.statistics.median, entry.statistics.variance, entry.statistics.standardDeviation
          ]), [105, 58, 58, 58, 58, 58, 58, CONTENT_WIDTH - 453], { fontSize: 7.2 });
          drawTable(["Attribute", "Q1", "Q3", "IQR", "5th pct.", "95th pct.", "Outlier count", "Detection method"], numericProfiles.map((entry) => [
            entry.name, entry.statistics.q1, entry.statistics.q3, entry.statistics.iqr, entry.statistics.percentile5, entry.statistics.percentile95, entry.outliers?.count ?? 0, entry.outliers?.method || "1.5 × IQR"
          ]), [105, 43, 43, 43, 54, 58, 78, CONTENT_WIDTH - 424], { fontSize: 7.2 });
        }
        profiles.filter((entry) => entry.frequencies || entry.date).forEach((entry) => {
          heading(entry.name + " · " + entry.type, 28, 9.5);
          if (entry.date) {
            if (entry.date.earliest && entry.date.latest) paragraph("Earliest: " + entry.date.earliest + " · Latest: " + entry.date.latest + " · Range: " + display(entry.date.rangeMilliseconds) + " ms · Parsing: " + entry.date.parsing, { size: 8 });
            else paragraph(entry.dateLimitation || "Date statistics unavailable.");
          }
          if (entry.type === "nominal" && Array.isArray(entry.declaredCategories)) {
            const declared = entry.declaredCategories;
            drawTable(["Declared category", "Observed count", "Observed share"], declared.slice(0, 25).map((item) => [item.value, item.count, percent(item.percentage)]), [CONTENT_WIDTH - 170, 85, 85], { fontSize: 7.5 });
            if (declared.length > 25) paragraph("Showing the first 25 declared categories, including categories with zero observations.", { size: 8 });
          } else if (entry.frequencies) {
            const frequencies = entry.frequencies;
            drawTable(["Most frequent observed value", "Count", "Share"], frequencies.displayed.map((item) => [item.value, item.count, percent(item.percentage)]), [CONTENT_WIDTH - 170, 85, 85], { fontSize: 7.5 });
            paragraph(frequencies.totalDistinct + " distinct observed values across " + frequencies.totalObserved + " valid observations. " + (frequencies.truncated ? "Frequency display is capped at " + frequencies.frequencyLimit + " values." : "All observed values are shown.") + (entry.type === "string" ? " Empty or whitespace-only strings: " + entry.emptyOrWhitespaceCount + "." : ""), { size: 8 });
          }
        });
      }
    }

    if (report.sections.customRules) {
      heading("Custom data-quality rule results", 35);
      if (dataset.ruleEvaluationError) paragraph("Rules were not evaluated for this report: " + dataset.ruleEvaluationError, { bold: true, size: 8 });
      else if (!quality?.ruleResults?.length) paragraph("No configured custom rules were evaluated for this dataset.");
      else {
        drawTable(["Rule", "Type", "Severity", "Status", "Failure count", "Explanation"], quality.ruleResults.map((rule) => [
          rule.name, rule.type, rule.severity, assessmentStatus(rule.status), rule.failureCount, rule.explanation
        ]), [92, 70, 55, 55, 58, CONTENT_WIDTH - 330], { fontSize: 7.2, cellLimit: 450 });
        quality.ruleResults.filter((rule) => rule.status === "failed" && rule.failureDetails?.length).forEach((rule) => {
          heading(rule.name + " · affected records", 24, 9);
          const details = rule.failureDetails.slice(0, 15);
          drawTable(["Record", "Attribute", "Observed value", "Finding"], details.map((item) => [
            item.recordIndex ?? "Dataset", item.attributeName || "—",
            item.value === null || item.value === undefined ? "?" : item.value,
            item.reason || rule.explanation
          ]), [55, 105, 125, CONTENT_WIDTH - 285], { fontSize: 7.2, cellLimit: 350 });
          if (rule.failureCount > details.length) paragraph("Showing " + details.length + " of " + rule.failureCount + " failure(s)." + (rule.detailsTruncated ? " The API detail list is capped at " + rule.detailLimit + "." : ""), { size: 8 });
        });
        paragraph("Failure count is the number of observations affected; severity summaries count failed rules, not individual observations.", { size: 8 });
      }
    }

    if (report.sections.visualExploration) {
      heading("Visual exploration", 35);
      if (!report.charts.overview && !report.charts.distribution) paragraph("No visual charts were selected for this report.");
      if (report.charts.overview) {
        const typeCounts = result.attributeTypeCounts || {};
        barChart("Attribute types", ["numeric", "nominal", "string", "date"].map((type) => ({ label: type, value: Number(typeCounts[type]) || 0 })));
        const missing = Array.isArray(result.missingValues?.byAttribute) ? result.missingValues.byAttribute : [];
        const missingTop = missing.slice().sort((left, right) => (right.count || 0) - (left.count || 0)).slice(0, 12);
        barChart("Missing values by attribute (top 12)", missingTop.map((item) => ({ label: item.name, value: Number(item.count) || 0 })));
        if (missing.length > 12) paragraph("The missing-value chart shows the 12 attributes with the highest missing counts; underlying summary counts remain complete.", { size: 8 });
      }
      if (report.charts.distribution) {
        const distribution = dataset.distribution;
        if (!distribution) addUnavailability("Attribute distribution", "No supported attribute is available.");
        else {
          heading("Distribution · " + distribution.attribute.name + " (" + distribution.kind + ")", 35, 10);
          let chartData = [];
          if (distribution.kind === "numeric") chartData = distribution.data.bins.map((bin) => ({ label: display(bin.start) + "–" + display(bin.end), value: bin.count }));
          else if (distribution.kind === "date") chartData = distribution.data.points.map((entry) => ({ label: entry.value, value: entry.count }));
          else chartData = distribution.data.categories.map((entry) => ({ label: entry.value || "(empty string)", value: entry.count }));
          if (!chartData.length) paragraph("No observations are available for this distribution.");
          else {
            barChart("Observed values for " + distribution.attribute.name, chartData);
            drawTable(["Displayed interval or value", "Count"], chartData.map((item) => [item.label, item.value]), [CONTENT_WIDTH - 100, 100], { fontSize: 7.5 });
          }
          if (distribution.data.truncated) paragraph("Category/period display is capped; counts shown correspond only to displayed values. Total distinct observations are reported in the underlying profile.", { size: 8 });
          if (distribution.kind === "numeric") paragraph(distribution.data.validCount + " valid numeric observations · " + distribution.data.missingCount + " missing · " + distribution.data.invalidCount + " invalid.", { size: 8 });
        }
      }
      paragraph("The PDF uses native vector charts and readable table fallbacks. It does not include scatter-plot points or a correlation matrix; use the interactive workspace for those views.", { size: 8 });
    }

    if (report.sections.recordSample) {
      heading("Illustrative record sample", 35);
      const sample = dataset.recordSample;
      if (!sample?.records?.length) paragraph("No parsed records are available to include.");
      else {
        const sampleAttributes = attributes.slice(0, 8);
        paragraph("Showing the first " + sample.records.length + " of " + sample.totalRecords + " parsed records from the unfiltered source dataset. This is an illustrative sample, not the full dataset." + (sample.truncated ? " Rows are truncated to the configured maximum of " + sample.displayedLimit + "." : "") + " At most eight schema attributes are displayed; values longer than 120 characters are visibly shortened.", { size: 8 });
        paragraph("Missing markers display as ?; a quoted literal question mark is labeled ? (literal) to distinguish it.", { size: 8 });
        const widths = [38, ...sampleAttributes.map(() => (CONTENT_WIDTH - 38) / Math.max(1, sampleAttributes.length))];
        drawTable(["Record", ...sampleAttributes.map((attribute) => attribute.name)], sample.records.map((record) => [
          record.index,
          ...sampleAttributes.map((attribute, index) => {
            const value = record.values?.[attribute.index];
            if (value === null || value === undefined) return "?";
            if (String(value) === "?" && record.quotedValues?.[attribute.index]) return "? (literal)";
            const text = String(value);
            return text.length > 120 ? text.slice(0, 120) + " … [truncated]" : text;
          })
        ]), widths, { fontSize: 6.5, cellLimit: 160, maxLines: 12 });
      }
    }
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(203, 213, 225);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.line(MARGIN, 42, PAGE_WIDTH - MARGIN, 42);
    doc.text(compact(report.metadata.title, 82), MARGIN, 32);
    doc.text(compact(pageLabels.get(page) || "ARFF analysis", 65), PAGE_WIDTH - MARGIN, 32, { align: "right" });
    doc.line(MARGIN, PAGE_HEIGHT - 34, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 34);
    doc.text("Generated " + reportTime(report.metadata.generatedAt), MARGIN, PAGE_HEIGHT - 21);
    doc.text("Page " + page + " of " + pages, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 21, { align: "right" });
  }
  return { doc, filename: sanitizeReportFilename(report.metadata.title) };
}

export function exportProfessionalReportPdf(report) {
  const { doc, filename } = createProfessionalReportPdf(report);
  doc.save(filename);
  return filename;
}
