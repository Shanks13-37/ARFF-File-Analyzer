import React, { useCallback, useEffect, useState } from "react";
import AnalysisSummary from "./AnalysisSummary.jsx";
import AttributeTable from "./AttributeTable.jsx";
import AnalysisFilters from "./AnalysisFilters.jsx";
import ReportView from "./ReportView.jsx";
import ErrorList from "./ErrorList.jsx";
import RecordTable from "./RecordTable.jsx";
import PaginationControls from "./PaginationControls.jsx";

const ROWS_PER_PAGE = 5;

export default function AnalysisResult({ result }) {
  if (!result) return null;

  const violations = Array.isArray(result.typeViolations) ? result.typeViolations : [];
  const records = Array.isArray(result.records) ? result.records : [];
  const attributes = Array.isArray(result.attributes) ? result.attributes : [];
  const missingByAttribute = Array.isArray(result.missingValues?.byAttribute) ? result.missingValues.byAttribute : [];
  const duplicates = Array.isArray(result.duplicates) ? result.duplicates : [];
  const [filteredRecords, setFilteredRecords] = useState(records);
  const [missingPage, setMissingPage] = useState(1);
  const [duplicatePage, setDuplicatePage] = useState(1);
  const handleFilteredRecords = useCallback((nextRecords) => setFilteredRecords(nextRecords), []);
  const missingPageCount = Math.ceil(missingByAttribute.length / ROWS_PER_PAGE);
  const duplicatePageCount = Math.ceil(duplicates.length / ROWS_PER_PAGE);
  const visibleMissingValues = missingByAttribute.slice((missingPage - 1) * ROWS_PER_PAGE, missingPage * ROWS_PER_PAGE);
  const visibleDuplicates = duplicates.slice((duplicatePage - 1) * ROWS_PER_PAGE, duplicatePage * ROWS_PER_PAGE);

  useEffect(() => {
    setFilteredRecords(records);
    setMissingPage(1);
    setDuplicatePage(1);
  }, [result]);

  return (
    <div className="analysisResults" aria-live="polite">
      <AnalysisSummary result={result} />
      <ErrorList errors={Array.isArray(result.errors) ? result.errors : []} />

      {violations.length > 0 && (
        <div className="analysisSection analysisErrors">
          <h2>Type violations</h2>
          <div className="analysisTableScroll">
            <table className="analysisTable">
              <thead><tr><th>Record</th><th>Attribute</th><th>Value</th><th>Source line</th><th>Message</th></tr></thead>
              <tbody>{violations.map((violation, index) => (
                <tr key={`${violation.recordIndex}-${violation.attributeIndex}-${index}`}>
                  <td>{violation.recordIndex ?? "—"}</td>
                  <td>{violation.attributeName || "—"}</td>
                  <td>{violation.value === null || violation.value === undefined ? "?" : String(violation.value)}</td>
                  <td>{violation.sourceLine ?? "—"}</td>
                  <td>{violation.message || "Invalid value."}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      <AttributeTable attributes={attributes} />

      <AnalysisFilters attributes={attributes} records={records} onFilteredRecords={handleFilteredRecords} />

      <div className="analysisSection">
        <h2>Missing values</h2>
        <p className="analysisCallout">Total missing values: <strong>{result.missingValues?.total ?? 0}</strong></p>
        {missingByAttribute.length > 0 && (
          <>
            <div className="analysisTableScroll">
              <table className="analysisTable compactTable">
                <thead><tr><th>Attribute</th><th>Missing values</th></tr></thead>
                <tbody>{visibleMissingValues.map((entry, index) => (
                  <tr key={`${entry.index ?? index}-${entry.name}`}>
                    <td>{entry.name || `Attribute ${(missingPage - 1) * ROWS_PER_PAGE + index}`}</td>
                    <td>{entry.count ?? 0}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <PaginationControls page={missingPage} pageCount={missingPageCount} onPageChange={setMissingPage} />
          </>
        )}
      </div>

      <div className="analysisSection">
        <h2>Duplicate records</h2>
        <p className="analysisCallout">Duplicate records: <strong>{result.summary?.duplicateRecordCount ?? 0}</strong></p>
        {duplicates.length > 0 && (
          <>
            <div className="analysisTableScroll">
              <table className="analysisTable compactTable">
                <thead><tr><th>Record indices</th><th>Repeated occurrences</th></tr></thead>
                <tbody>{visibleDuplicates.map((group, index) => (
                  <tr key={(duplicatePage - 1) * ROWS_PER_PAGE + index}>
                    <td>{Array.isArray(group.recordIndices) ? group.recordIndices.join(", ") : "—"}</td>
                    <td>{group.duplicateRecordCount ?? 0}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <PaginationControls page={duplicatePage} pageCount={duplicatePageCount} onPageChange={setDuplicatePage} />
          </>
        )}
      </div>

      <RecordTable attributes={attributes} records={filteredRecords} />
      <ReportView analysisResult={result} />
    </div>
  );
}
