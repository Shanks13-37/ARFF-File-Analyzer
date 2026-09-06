import React from "react";

export default function ErrorList({ errors = [] }) {
  if (!errors.length) return null;

  return (
    <div className="analysisSection analysisErrors">
      <h2>Parsing errors</h2>
      <div className="analysisTableScroll">
        <table className="analysisTable">
          <thead><tr><th>Line</th><th>Section</th><th>Code</th><th>Message</th></tr></thead>
          <tbody>
            {errors.map((error, index) => (
              <tr key={`${error.code || "error"}-${error.line ?? "unknown"}-${index}`}>
                <td>{error.line ?? "—"}</td>
                <td>{error.section || "—"}</td>
                <td>{error.code || "ERROR"}</td>
                <td>{error.message || String(error)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
