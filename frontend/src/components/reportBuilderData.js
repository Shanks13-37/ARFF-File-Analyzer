import {
  prepareCategoryFrequencies,
  prepareDateDistribution,
  prepareHistogram
} from "./explorationData.js";

export const REPORT_SECTIONS = [
  { key: "executiveSummary", label: "Executive summary", defaultChecked: true },
  { key: "overview", label: "Dataset overview and schema", defaultChecked: true },
  { key: "validation", label: "Parsing and validation", defaultChecked: true },
  { key: "qualityOverview", label: "Data-quality overview", defaultChecked: true },
  { key: "qualityMetrics", label: "Quality metrics and missing values", defaultChecked: true },
  { key: "duplicates", label: "Duplicate-record analysis", defaultChecked: true },
  { key: "profiling", label: "Statistical profiling", defaultChecked: true },
  { key: "customRules", label: "Custom quality-rule results", defaultChecked: true },
  { key: "visualExploration", label: "Visual exploration", defaultChecked: true },
  { key: "recordSample", label: "Sample of parsed records (opt-in)", defaultChecked: false }
];

export const DEFAULT_REPORT_SECTIONS = Object.fromEntries(REPORT_SECTIONS.map(({ key, defaultChecked }) => [key, defaultChecked]));

const NUMERIC_TYPES = new Set(["numeric", "real", "integer"]);

export function getReportDatasetKey(entry, index = 0) {
  return String(entry?.key ?? entry?.result?.datasetId ?? (index + ":" + (entry?.fileName || entry?.result?.file?.name || "dataset")));
}

export function sanitizeReportFilename(title) {
  let safe = String(title || "ARFF Analysis Report")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!safe || /^\.+$/.test(safe)) safe = "arff-analysis-report";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = "arff-" + safe;
  return safe + ".pdf";
}

function defaultDistributionAttribute(attributes) {
  return attributes.find((attribute) => NUMERIC_TYPES.has(String(attribute.type).toLowerCase()))
    || attributes.find((attribute) => ["nominal", "string", "date"].includes(String(attribute.type).toLowerCase()))
    || attributes[0]
    || null;
}

function distributionFor(result, attribute) {
  if (!attribute) return null;
  const records = Array.isArray(result?.records) ? result.records : [];
  const type = String(attribute.type || "").toLowerCase();
  if (NUMERIC_TYPES.has(type)) return { kind: "numeric", attribute, data: prepareHistogram(records, attribute) };
  if (type === "nominal" || type === "string") return { kind: type, attribute, data: prepareCategoryFrequencies(records, attribute) };
  if (type === "date") return { kind: "date", attribute, data: prepareDateDistribution(records, attribute) };
  return null;
}

export function buildReportData({
  datasets = [],
  selectedKeys = [],
  activeDatasetKey,
  metadata = {},
  sections = DEFAULT_REPORT_SECTIONS,
  charts = { distribution: true, overview: true },
  distributionAttributes = {},
  sampleLimit = 10,
  qualityOverrides = {},
  ruleEvaluationErrors = {}
} = {}) {
  const selected = new Set(selectedKeys.map(String));
  const entries = datasets.map((entry, index) => ({ ...entry, key: getReportDatasetKey(entry, index) }))
    .filter((entry) => selected.has(entry.key) && entry.result);
  const maximumSample = Math.min(20, Math.max(1, Number(sampleLimit) || 10));
  const reportDatasets = entries.map((entry) => {
    const result = entry.result;
    const attributes = Array.isArray(result.attributes) ? result.attributes : [];
    const records = Array.isArray(result.records) ? result.records : [];
    const requestedAttribute = distributionAttributes[entry.key];
    const attribute = attributes.find((item) => String(item.index) === String(requestedAttribute)) || defaultDistributionAttribute(attributes);
    const qualityAssessment = Object.hasOwn(qualityOverrides, entry.key) ? qualityOverrides[entry.key] : result.qualityAssessment || null;
    const distribution = sections.visualExploration && charts.distribution ? distributionFor(result, attribute) : null;
    const recordSample = sections.recordSample
      ? { records: records.slice(0, maximumSample), totalRecords: records.length, truncated: records.length > maximumSample, displayedLimit: maximumSample }
      : null;
    return {
      key: entry.key,
      fileName: entry.fileName || result.file?.name || "Unknown file",
      result,
      qualityAssessment,
      ruleEvaluationError: ruleEvaluationErrors[entry.key] || null,
      distribution,
      recordSample
    };
  });
  return {
    metadata: {
      title: String(metadata.title || "").trim() || "ARFF Data Analysis Report",
      description: String(metadata.description || "").trim(),
      author: String(metadata.author || "").trim(),
      generatedAt: metadata.generatedAt || new Date().toISOString()
    },
    sections: { ...DEFAULT_REPORT_SECTIONS, ...sections },
    charts: { distribution: charts.distribution !== false, overview: charts.overview !== false },
    activeDatasetKey: activeDatasetKey == null ? null : String(activeDatasetKey),
    datasets: reportDatasets
  };
}

export function getUnavailableReportSections(report) {
  const unavailable = [];
  for (const dataset of report.datasets) {
    const result = dataset.result;
    const label = dataset.fileName;
    const add = (section, reason) => unavailable.push({ dataset: label, section, reason });
    if (report.sections.qualityOverview && !dataset.qualityAssessment) add("Data-quality overview", "No quality assessment is available.");
    if (report.sections.qualityMetrics && !dataset.qualityAssessment?.dimensions) add("Quality metrics and missing values", "The quality dimensions are unavailable.");
    if (report.sections.profiling && !Array.isArray(result.statisticalProfile?.attributes)) add("Statistical profiling", "No statistical profile is available.");
    if (report.sections.customRules) {
      if (dataset.ruleEvaluationError) add("Custom quality-rule results", dataset.ruleEvaluationError);
      else if (!dataset.qualityAssessment?.ruleResults?.length) add("Custom quality-rule results", "No configured rules were evaluated for this dataset.");
    }
    if (report.sections.visualExploration && report.charts.distribution && !dataset.distribution) add("Visual exploration", "No supported attribute distribution is available.");
    if (report.sections.recordSample && !dataset.recordSample?.records?.length) add("Sample of parsed records", "No parsed records are available to sample.");
  }
  return unavailable;
}
