import React, { useEffect, useMemo } from "react";
import AnalysisCharts from "./AnalysisCharts.jsx";
import { getReportSections } from "./analysisVisualData.js";
import { exportAnalysisPdf } from "./exportPdf.js";
import { logClientError } from "../utils/errorLogger.js";

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function ReportView({ analysisResult }) {
  const [exportError, setExportError] = React.useState("");
  const [exporting, setExporting] = React.useState(false);
  const sections = useMemo(() => getReportSections(analysisResult), [analysisResult]);
  const attributes = Array.isArray(analysisResult?.attributes) ? analysisResult.attributes : [];
  const violations = Array.isArray(analysisResult?.typeViolations) ? analysisResult.typeViolations : [];
  const errors = Array.isArray(analysisResult?.errors) ? analysisResult.errors : [];
  const duplicates = Array.isArray(analysisResult?.duplicates) ? analysisResult.duplicates : [];
  const missing = analysisResult?.missingValues || {};
  const generatedAt = useMemo(() => new Date().toLocaleString(), [analysisResult]);

  useEffect(() => {
    setExportError("");
  }, [analysisResult]);

  function exportPdf() {
    setExportError("");
    setExporting(true);
    try {
      exportAnalysisPdf(analysisResult, generatedAt);
    } catch (error) {
      console.error(error);
      logClientError({ stage: "pdf-generation", code: "PDF_GENERATION_FAILED", message: error.message });
      setExportError("The PDF could not be generated. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="reportPreview">
      <div className="reportHeader">
        <div>
          <p className="eyebrow">Report preview</p>
          <h2>ARFF File Analysis Report</h2>
          <p>Generated {generatedAt}</p>
        </div>
        <div className="reportHeaderActions">
          <span className={`analysisStatus ${analysisResult?.valid ? "valid" : "invalid"}`}>
            {analysisResult?.valid ? "VALID" : "HAS VALIDATION ISSUES"}
          </span>
          <button type="button" onClick={exportPdf} disabled={exporting}>{exporting ? "Generating PDF..." : "Export as PDF"}</button>
        </div>
      </div>
      {exportError && <div className="result failure">{exportError}</div>}

      <div className="reportMetadata">
        <span><strong>File:</strong> {analysisResult?.file?.name || "Unknown"}</span>
        <span><strong>Relation:</strong> {analysisResult?.relation || "Unknown"}</span>
        <span><strong>Size:</strong> {formatBytes(analysisResult?.file?.size)}</span>
      </div>

      <div className="reportBlock">
        <h3>Dataset statistics</h3>
        <p>Instances: <strong>{analysisResult?.summary?.instanceCount ?? 0}</strong> · Attributes: <strong>{analysisResult?.summary?.attributeCount ?? 0}</strong> · Missing values: <strong>{analysisResult?.summary?.missingValueCount ?? 0}</strong> · Duplicate records: <strong>{analysisResult?.summary?.duplicateRecordCount ?? 0}</strong></p>
      </div>

      <div className="reportBlock">
        <h3>Attribute type counts</h3>
        <p>{Object.entries(analysisResult?.attributeTypeCounts || {}).map(([type, value]) => `${type}: ${value ?? 0}`).join(" · ") || "No attributes"}</p>
      </div>

      <div className="reportBlock">
        <h3>Attribute information</h3>
        <div className="analysisTableScroll"><table className="analysisTable"><thead><tr><th>Index</th><th>Name</th><th>Type</th><th>Nominal values</th><th>Missing</th></tr></thead><tbody>{attributes.length ? attributes.map((attribute, index) => <tr key={`${attribute.index ?? index}-${attribute.name}`}><td>{attribute.index ?? index}</td><td>{attribute.name}</td><td>{attribute.type}</td><td>{attribute.nominalValues?.join(", ") || "—"}</td><td>{attribute.missingCount ?? 0}</td></tr>) : <tr><td colSpan="5">No attributes</td></tr>}</tbody></table></div>
      </div>

      <div className="reportBlock">
        <h3>Missing-value summary</h3>
        <p>Total missing values: <strong>{missing.total ?? 0}</strong></p>
        <ul>{(missing.byAttribute || []).map((entry, index) => <li key={`${entry.index ?? index}-${entry.name}`}>{entry.name}: {entry.count ?? 0}</li>)}</ul>
      </div>

      <div className="reportBlock">
        <h3>Duplicate-record summary</h3>
        <p>Duplicate records: <strong>{analysisResult?.summary?.duplicateRecordCount ?? 0}</strong></p>
        {duplicates.length > 0 && <ul>{duplicates.map((group, index) => <li key={index}>Records {group.recordIndices?.join(", ") || "—"} ({group.duplicateRecordCount ?? 0} repeated occurrence(s))</li>)}</ul>}
      </div>

      <div className="reportBlock">
        <h3>Type-validation results</h3>
        {violations.length === 0 ? <p>No type violations.</p> : <ul>{violations.map((violation, index) => <li key={index}>{violation.message} {violation.sourceLine ? `(line ${violation.sourceLine})` : ""}</li>)}</ul>}
      </div>

      <div className="reportBlock">
        <h3>Parsing and syntax errors</h3>
        {errors.length === 0 ? <p>No parsing or syntax errors.</p> : <ul>{errors.map((error, index) => <li key={index}>{error.message || String(error)} {error.line ? `(line ${error.line})` : ""}</li>)}</ul>}
      </div>

      <div className="reportBlock">
        <h3>Report sections</h3>
        <span className="visuallyHidden">{sections.map((entry) => entry.section).join(", ")}</span>
      </div>

      <AnalysisCharts analysisResult={analysisResult} />
    </section>
  );
}
