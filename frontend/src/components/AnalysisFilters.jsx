import React, { useEffect, useMemo, useState } from "react";
import { filterRecords } from "./filterRecords.js";
import { logClientError } from "../utils/errorLogger.js";

function initialCriteria() {
  return { mode: "exact", value: "", min: "", max: "" };
}

export default function AnalysisFilters({ attributes = [], records = [], onFilteredRecords }) {
  const [selectedAttribute, setSelectedAttribute] = useState("");
  const [criteria, setCriteria] = useState(initialCriteria);
  const [filteredRecords, setFilteredRecords] = useState(records);
  const [error, setError] = useState("");
  const attribute = useMemo(
    () => attributes.find((entry, index) => String(entry.index ?? index) === selectedAttribute),
    [attributes, selectedAttribute]
  );

  useEffect(() => {
    setSelectedAttribute("");
    setCriteria(initialCriteria());
    setError("");
    setFilteredRecords(records);
    onFilteredRecords(records);
  }, [records, onFilteredRecords]);

  function changeAttribute(event) {
    setSelectedAttribute(event.target.value);
    setCriteria(initialCriteria());
    setError("");
    setFilteredRecords(records);
    onFilteredRecords(records);
  }

  function applyFilter(event) {
    event.preventDefault();
    const result = filterRecords(records, attribute, criteria);
    setError(result.error || "");
    if (result.error) {
      logClientError({
        stage: "filtering",
        code: "INVALID_FILTER_CRITERIA",
        message: result.error,
        context: { attribute: attribute?.name, type: attribute?.type }
      });
    }
    setFilteredRecords(result.records);
    onFilteredRecords(result.records);
  }

  function clearFilter() {
    setSelectedAttribute("");
    setCriteria(initialCriteria());
    setError("");
    setFilteredRecords(records);
    onFilteredRecords(records);
  }

  function updateCriteria(field, value) {
    setCriteria((current) => ({ ...current, [field]: value }));
  }

  const type = String(attribute?.type || "").toLowerCase();
  const isNumeric = ["numeric", "integer", "real"].includes(type);

  return (
    <div className="analysisSection analysisFilters">
      <div>
        <h2>Search and filter records</h2>
        <p className="analysisCallout">Choose an attribute and apply a client-side filter to the loaded records.</p>
      </div>
      <form className="filterControls" onSubmit={applyFilter}>
        <label className="field">
          <span>Attribute</span>
          <select value={selectedAttribute} onChange={changeAttribute} disabled={!attributes.length}>
            <option value="">All attributes</option>
            {attributes.map((entry, index) => <option key={`${entry.index ?? index}-${entry.name}`} value={entry.index ?? index}>{entry.name} ({entry.type})</option>)}
          </select>
        </label>

        {isNumeric && (
          <>
            <label className="field">
              <span>Numeric mode</span>
              <select value={criteria.mode} onChange={(event) => updateCriteria("mode", event.target.value)}>
                <option value="exact">Exact value</option>
                <option value="range">Minimum / maximum</option>
              </select>
            </label>
            {criteria.mode === "exact" ? (
              <label className="field"><span>Value</span><input inputMode="decimal" value={criteria.value} onChange={(event) => updateCriteria("value", event.target.value)} /></label>
            ) : (
              <>
                <label className="field"><span>Minimum</span><input inputMode="decimal" value={criteria.min} onChange={(event) => updateCriteria("min", event.target.value)} /></label>
                <label className="field"><span>Maximum</span><input inputMode="decimal" value={criteria.max} onChange={(event) => updateCriteria("max", event.target.value)} /></label>
              </>
            )}
          </>
        )}

        {type === "nominal" && (
          <label className="field"><span>Nominal value</span><select value={criteria.value} onChange={(event) => updateCriteria("value", event.target.value)}><option value="">Choose a value</option>{(attribute.nominalValues || []).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        )}

        {(type === "string" || type === "date") && (
          <label className="field"><span>{type === "date" ? "Date value" : "Text contains"}</span><input value={criteria.value} onChange={(event) => updateCriteria("value", event.target.value)} /></label>
        )}

        <div className="filterButtons">
          <button type="submit" disabled={!attribute}>Filter</button>
          <button className="secondaryButton" type="button" onClick={clearFilter}>Clear</button>
        </div>
      </form>
      {error && <div className="result failure">{error}</div>}
      <p className="filterMatchCount">Showing <strong>{filteredRecords.length}</strong> of {records.length} records.</p>
    </div>
  );
}
