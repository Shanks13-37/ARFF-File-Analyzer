import React from "react";

function displayValue(value) {
  if (value === null || value === undefined) return "?";
  return String(value);
}

export default function RecordTable({ attributes = [], records = [] }) {
  return (
    <div className="analysisSection">
      <h2>Parsed records</h2>
      {records.length === 0 ? <p className="empty">No records were parsed.</p> : (
        <div className="analysisTableScroll">
          <table className="analysisTable recordTable">
            <thead>
              <tr><th>Record</th>{attributes.map((attribute, index) => <th key={`${attribute.name}-${index}`}>{attribute.name || `Attribute ${index}`}</th>)}</tr>
            </thead>
            <tbody>
              {records.map((record, recordIndex) => (
                <tr key={record.index ?? recordIndex}>
                  <td>{record.index ?? recordIndex}</td>
                  {attributes.map((_attribute, attributeIndex) => (
                    <td key={attributeIndex}>{displayValue(record.values?.[attributeIndex])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
