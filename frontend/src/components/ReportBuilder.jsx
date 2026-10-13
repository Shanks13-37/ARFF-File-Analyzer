import React, { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { exportProfessionalReportPdf } from "./professionalReportPdf.js";
import {
  buildReportData,
  DEFAULT_REPORT_SECTIONS,
  getReportDatasetKey,
  getUnavailableReportSections,
  REPORT_SECTIONS
} from "./reportBuilderData.js";

const API_URL = import.meta.env.VITE_API_URL || "";
const SAMPLE_LIMITS = [5, 10, 20];
const NO_RULES = [];

function entryCount(entry, key) {
  const result = entry.result || {};
  if (key === "records") return result.summary?.instanceCount ?? result.records?.length ?? 0;
  return result.summary?.attributeCount ?? result.attributes?.length ?? 0;
}

function describeRequestError(data, status) {
  const details = Array.isArray(data?.errors) ? data.errors.map((entry) => entry.message).filter(Boolean).join(" ") : "";
  return (details || data?.error || ("Quality rules could not be evaluated (HTTP " + status + ").")).slice(0, 300);
}

function unavailableRuleAssessment(base, ruleCount) {
  if (!base) return null;
  return {
    ...base,
    summary: { ...base.summary, configuredRuleCount: ruleCount, enabledRuleCount: null, evaluatedRuleCount: null, passedRuleCount: null, failedRuleCount: null, skippedRuleCount: null },
    dimensions: {
      ...base.dimensions,
      ruleCompliance: { status: "unavailable", configuredRuleCount: ruleCount, passedRuleCount: null, failedRuleCount: null, skippedRuleCount: null }
    },
    ruleResults: []
  };
}

export default function ReportBuilder({
  datasets = [],
  activeDatasetKey,
  token,
  qualityRules = NO_RULES,
  filteredRecordCount,
  totalRecordCount
}) {
  const signature = datasets.map((entry, index) => getReportDatasetKey(entry, index)).join("|");
  const activeKey = activeDatasetKey == null ? null : String(activeDatasetKey);
  const [open, setOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(() => activeKey ? [activeKey] : []);
  const [metadata, setMetadata] = useState({ title: "ARFF Data Analysis Report", description: "", author: "" });
  const [sections, setSections] = useState(DEFAULT_REPORT_SECTIONS);
  const [charts, setCharts] = useState({ distribution: true, overview: true });
  const [distributionAttributes, setDistributionAttributes] = useState({});
  const [sampleLimit, setSampleLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [generatedReport, setGeneratedReport] = useState(null);
  const entryLookup = useMemo(() => new Map(datasets.map((entry, index) => [getReportDatasetKey(entry, index), { ...entry, key: getReportDatasetKey(entry, index) }])), [signature]);
  const selectedEntries = selectedKeys.map((key) => entryLookup.get(key)).filter((entry) => entry?.result);

  useEffect(() => {
    setSelectedKeys(activeKey ? [activeKey] : []);
    setDistributionAttributes({});
    setGeneratedReport(null);
  }, [signature, activeKey]);

  useEffect(() => {
    setGeneratedReport(null);
    setSuccess("");
  }, [qualityRules]);

  const preview = useMemo(() => buildReportData({
    datasets,
    selectedKeys,
    activeDatasetKey: activeKey,
    metadata: { ...metadata, generatedAt: new Date().toISOString() },
    sections,
    charts,
    distributionAttributes,
    sampleLimit
  }), [signature, selectedKeys, activeKey, metadata, sections, charts, distributionAttributes, sampleLimit]);
  const visiblePreview = generatedReport || preview;
  const unavailable = getUnavailableReportSections(visiblePreview).filter((item) =>
    !(qualityRules.length > 0 && !generatedReport && item.section === "Custom quality-rule results" && item.reason === "No configured rules were evaluated for this dataset.")
  );
  const selectedKeySet = new Set(selectedKeys);
  const allDataAvailable = datasets.some((entry) => entry.result);
  const currentFileFiltered = Number.isFinite(filteredRecordCount) && Number.isFinite(totalRecordCount) && filteredRecordCount !== totalRecordCount;

  function selectCurrent() {
    setSelectedKeys(activeKey ? [activeKey] : []);
    setGeneratedReport(null);
    setError("");
    setSuccess("");
  }

  function selectAllAvailable() {
    setSelectedKeys(datasets.map((entry, index) => ({ entry, key: getReportDatasetKey(entry, index) })).filter(({ entry }) => entry.result).map(({ key }) => key));
    setGeneratedReport(null);
    setError("");
    setSuccess("");
  }

  function toggleDataset(key) {
    setSelectedKeys((current) => current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]);
    setGeneratedReport(null);
    setSuccess("");
  }

  function toggleSection(key) {
    setSections((current) => ({ ...current, [key]: !current[key] }));
    setGeneratedReport(null);
    setSuccess("");
  }

  function updateMetadata(field, value) {
    setMetadata((current) => ({ ...current, [field]: value }));
    setGeneratedReport(null);
    setSuccess("");
  }

  async function runQualityRules(entry) {
    if (!qualityRules.length) return { assessment: entry.result.qualityAssessment || null, error: null };
    if (!entry.sourceFile) return { assessment: unavailableRuleAssessment(entry.result.qualityAssessment, qualityRules.length), error: "The original uploaded file is not available in this session." };
    const form = new FormData();
    form.append("file", entry.sourceFile);
    form.append("rules", JSON.stringify(qualityRules));
    try {
      const response = await fetch(API_URL + "/api/quality/evaluate", {
        method: "POST",
        headers: token ? { Authorization: "Bearer " + token } : {},
        body: form
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return { assessment: unavailableRuleAssessment(entry.result.qualityAssessment, qualityRules.length), error: describeRequestError(data, response.status) };
      if (!data.qualityAssessment) return { assessment: unavailableRuleAssessment(entry.result.qualityAssessment, qualityRules.length), error: "The quality service returned no assessment." };
      return { assessment: data.qualityAssessment, error: null };
    } catch {
      return { assessment: unavailableRuleAssessment(entry.result.qualityAssessment, qualityRules.length), error: "The quality evaluation service could not be reached." };
    }
  }

  async function generate(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!selectedEntries.length) {
      setError("Select at least one analyzed dataset.");
      return;
    }
    if (!metadata.title.trim()) {
      setError("Enter a report title.");
      return;
    }
    setBusy(true);
    try {
      const qualityOverrides = {};
      const ruleEvaluationErrors = {};
      for (const entry of selectedEntries) {
        const evaluated = await runQualityRules(entry);
        qualityOverrides[entry.key] = evaluated.assessment;
        if (evaluated.error) ruleEvaluationErrors[entry.key] = evaluated.error;
      }
      const report = buildReportData({
        datasets,
        selectedKeys,
        activeDatasetKey: activeKey,
        metadata: { ...metadata, generatedAt: new Date().toISOString() },
        sections,
        charts,
        distributionAttributes,
        sampleLimit,
        qualityOverrides,
        ruleEvaluationErrors
      });
      if (!report.datasets.length) throw new Error("The selected analysis results are no longer available. Select the dataset again.");
      setGeneratedReport(report);
      const filename = exportProfessionalReportPdf(report);
      const ruleWarnings = Object.keys(ruleEvaluationErrors).length;
      setSuccess("Report downloaded as " + filename + "." + (ruleWarnings ? " Custom rules could not be evaluated for " + ruleWarnings + " selected dataset(s); the report marks those results unavailable." : ""));
    } catch (generationError) {
      setError(generationError.message || "The report could not be generated. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="analysisSection reportBuilder" aria-labelledby="report-builder-heading">
    <div className="reportBuilderHeading">
      <div><p className="eyebrow">Document export</p><h2 id="report-builder-heading">Professional report builder</h2><p>Choose datasets and sections, review the report contents, then download a PDF.</p></div>
      <button type="button" className="secondaryButton" aria-expanded={open} onClick={() => { setOpen((value) => !value); setError(""); }}>
        <FileText size={17} /> {open ? "Close builder" : "Configure report"}
      </button>
    </div>
    {open && <form className="reportBuilderForm" onSubmit={generate}>
      <fieldset className="reportMetadataFields" disabled={busy}>
        <legend>Report metadata</legend>
        <label>Report title<input value={metadata.title} maxLength={120} onChange={(event) => updateMetadata("title", event.target.value)} required /></label>
        <label>Prepared by (optional)<input value={metadata.author} maxLength={100} onChange={(event) => updateMetadata("author", event.target.value)} /></label>
        <label className="reportDescriptionField">Description or notes (optional)<textarea rows="3" maxLength={1200} value={metadata.description} onChange={(event) => updateMetadata("description", event.target.value)} /></label>
      </fieldset>

      <fieldset className="reportDatasetPicker" disabled={busy}>
        <legend>Datasets to include</legend>
        <div className="reportSelectionActions"><button type="button" className="linkButton" onClick={selectCurrent} disabled={!activeKey}>Use current file</button><button type="button" className="linkButton" onClick={selectAllAvailable}>Select all analyzed</button><span>{selectedEntries.length} selected</span></div>
        {!allDataAvailable ? <p className="empty">No analyzed dataset is available to report.</p> : <div className="reportDatasetList">{datasets.map((entry, index) => {
          const key = getReportDatasetKey(entry, index);
          if (!entry.result) return null;
          return <label className="reportDatasetOption" key={key}><input type="checkbox" checked={selectedKeySet.has(key)} onChange={() => toggleDataset(key)} /><span className="reportDatasetName" title={entry.fileName}>{entry.fileName || entry.result.file?.name || "Unknown file"}</span><small>{entry.result.valid ? "ARFF valid" : "Validation issues"} · {entryCount(entry, "records")} records · {entryCount(entry, "attributes")} attributes</small></label>;
        })}</div>}
      </fieldset>

      <fieldset className="reportSectionPicker" disabled={busy}>
        <legend>Report sections</legend>
        <div className="reportSectionChoices">{REPORT_SECTIONS.map((section) => <label key={section.key}><input type="checkbox" checked={sections[section.key]} onChange={() => toggleSection(section.key)} /><span>{section.label}</span></label>)}</div>
      </fieldset>

      {sections.visualExploration && <fieldset className="reportChartOptions" disabled={busy}>
        <legend>Selected charts</legend>
        <label><input type="checkbox" checked={charts.overview} onChange={(event) => { setCharts((current) => ({ ...current, overview: event.target.checked })); setGeneratedReport(null); }} /><span>Attribute-type and missing-value overview charts</span></label>
        <label><input type="checkbox" checked={charts.distribution} onChange={(event) => { setCharts((current) => ({ ...current, distribution: event.target.checked })); setGeneratedReport(null); }} /><span>Type-aware distribution chart</span></label>
        {charts.distribution && selectedEntries.map((entry) => {
          const attributes = Array.isArray(entry.result.attributes) ? entry.result.attributes : [];
          return <label className="reportDistributionChoice" key={entry.key}><span>{entry.fileName} · distribution attribute</span><select value={distributionAttributes[entry.key] ?? ""} onChange={(event) => { setDistributionAttributes((current) => ({ ...current, [entry.key]: event.target.value })); setGeneratedReport(null); }}><option value="">Automatic (first suitable attribute)</option>{attributes.map((attribute) => <option key={attribute.index} value={attribute.index}>{attribute.name} · {attribute.type}</option>)}</select></label>;
        })}
      </fieldset>}

      {sections.recordSample && <fieldset className="reportSampleOptions" disabled={busy}><legend>Optional record sample</legend><label>Maximum displayed rows<select value={sampleLimit} onChange={(event) => { setSampleLimit(Number(event.target.value)); setGeneratedReport(null); }}>{SAMPLE_LIMITS.map((limit) => <option key={limit} value={limit}>{limit} rows</option>)}</select></label><p>The sample is opt-in and uses the first rows from each selected parsed dataset, not the active interactive filter. At most eight attributes are displayed; long cells are visibly shortened.</p></fieldset>}

      <div className="reportReview" aria-live="polite">
        <h3>Report preview</h3>
        <p>Generated date: {new Date().toLocaleString()} · {preview.sections.recordSample ? "Record sample included by request." : "No record-level sample included."}</p>
        {currentFileFiltered && <p className="reportReviewNote">The current interactive view is filtered to {filteredRecordCount} of {totalRecordCount} records. This report uses each selected dataset’s full parsed results; samples are explicitly unfiltered.</p>}
        <div className="analysisTableScroll"><table className="analysisTable compactTable"><thead><tr><th>Dataset</th><th>ARFF validity</th><th>Records</th><th>Attributes</th><th>Selected</th></tr></thead><tbody>{datasets.filter((entry, index) => entry.result && selectedKeySet.has(getReportDatasetKey(entry, index))).map((entry) => <tr key={getReportDatasetKey(entry)}><td className="reportDatasetName">{entry.fileName || entry.result.file?.name}</td><td>{entry.result.valid ? "Valid" : "Validation issues"}</td><td>{entryCount(entry, "records")}</td><td>{entryCount(entry, "attributes")}</td><td>Included</td></tr>)}</tbody></table></div>
        <p>Sections: {REPORT_SECTIONS.filter((section) => sections[section.key]).map((section) => section.label).join(" · ") || "No analysis sections selected"}</p>
        {sections.visualExploration && <p className="reportReviewNote">Native PDF charts cover the selected overview and per-dataset distribution. Scatter points and correlation matrices remain available in the interactive workspace and are not embedded in this report.</p>}
        {qualityRules.length > 0 && <p className="reportReviewNote">{qualityRules.length} session rule(s) will be re-evaluated against every selected original upload immediately before export. Results are not reused from another file or an earlier run.</p>}
        {unavailable.length > 0 && <details className="reportUnavailable"><summary>{unavailable.length} unavailable or not-yet-evaluated item(s)</summary><ul>{unavailable.slice(0, 20).map((item, index) => <li key={item.dataset + item.section + index}><strong>{item.dataset} · {item.section}:</strong> {item.reason}</li>)}</ul>{unavailable.length > 20 && <p>Showing 20 of {unavailable.length} notices.</p>}</details>}
      </div>

      {error && <div className="result failure" role="alert">{error}</div>}
      {success && <div className="result success" role="status">{success}</div>}
      <div className="reportBuilderActions"><span>PDF generation runs in your authenticated session. No report or record sample is stored by the server.</span><button type="submit" disabled={busy || !selectedEntries.length}><Download size={17} /> {busy ? "Evaluating rules and generating…" : "Generate report PDF"}</button></div>
    </form>}
  </section>;
}
