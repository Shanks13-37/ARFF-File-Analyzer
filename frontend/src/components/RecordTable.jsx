import React, { useEffect, useState } from "react";

const RECORDS_PER_PAGE = 10;

function displayValue(value) {
  if (value === null || value === undefined) return "?";
  return String(value);
}

export default function RecordTable({ attributes = [], records = [] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.ceil(records.length / RECORDS_PER_PAGE);
  const pageStart = (page - 1) * RECORDS_PER_PAGE;
  const visibleRecords = records.slice(pageStart, pageStart + RECORDS_PER_PAGE);

  useEffect(() => {
    setPage(1);
  }, [records]);

  useEffect(() => {
    if (page > pageCount && pageCount > 0) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <div className="analysisSection">
      <h2>Parsed records</h2>
      {records.length === 0 ? <p className="empty">No records were parsed.</p> : (
        <>
          <div className="analysisTableScroll">
            <table className="analysisTable recordTable">
              <thead>
                <tr><th>Record</th>{attributes.map((attribute, index) => <th key={`${attribute.name}-${index}`}>{attribute.name || `Attribute ${index}`}</th>)}</tr>
              </thead>
              <tbody>
                {visibleRecords.map((record, recordIndex) => (
                  <tr key={record.index ?? pageStart + recordIndex}>
                    <td>{record.index ?? pageStart + recordIndex}</td>
                    {attributes.map((_attribute, attributeIndex) => (
                      <td key={attributeIndex}>{displayValue(record.values?.[attributeIndex])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="recordPagination" aria-label="Parsed records pagination">
              <button className="secondaryButton" type="button" onClick={() => setPage((current) => current - 1)} disabled={page === 1}>
                Previous
              </button>
              <span>Page {page} of {pageCount}</span>
              <button className="secondaryButton" type="button" onClick={() => setPage((current) => current + 1)} disabled={page === pageCount}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
