import React from "react";

function valueOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export default function AnalysisSummary({ result }) {
  const summary = result?.summary || {};
  const typeCounts = result?.attributeTypeCounts || {};

  return (
    <div className="analysisSection">
      <div className="analysisHeader">
        <div>
          <p className="eyebrow">Dataset analysis</p>
          <h2>{result?.file?.name || "Uploaded dataset"}</h2>
          <p>Relation: <strong>{result?.relation || "Unknown"}</strong></p>
        </div>
        <span className={`analysisStatus ${result?.valid ? "valid" : "invalid"}`}>
          {result?.valid ? "VALID DATASET" : "VALIDATION ISSUES"}
        </span>
      </div>

      <div className="analysisMetricGrid">
        <div><strong>{result?.file?.size ? `${(result.file.size / 1024 ** 2).toFixed(2)} MB` : "0 B"}</strong><span>File size</span></div>
        <div><strong>{valueOrZero(summary.instanceCount)}</strong><span>Instances</span></div>
        <div><strong>{valueOrZero(summary.attributeCount)}</strong><span>Attributes</span></div>
        <div><strong>{valueOrZero(summary.missingValueCount)}</strong><span>Missing values</span></div>
        <div><strong>{valueOrZero(summary.duplicateRecordCount)}</strong><span>Duplicate records</span></div>
      </div>

      <div className="analysisTypeSummary">
        {[
          ["numeric", "Numeric"],
          ["nominal", "Nominal"],
          ["string", "String"],
          ["date", "Date"]
        ].map(([key, label]) => (
          <span key={key}><strong>{valueOrZero(typeCounts[key])}</strong> {label}</span>
        ))}
      </div>
    </div>
  );
}
