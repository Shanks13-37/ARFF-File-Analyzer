import React from "react";

export default function AttributeTable({ attributes = [] }) {
  return (
    <div className="analysisSection">
      <h2>Attribute information</h2>
      {attributes.length === 0 ? <p className="empty">No attributes were parsed.</p> : (
        <div className="analysisTableScroll">
          <table className="analysisTable">
            <thead><tr><th>Index</th><th>Name</th><th>Type</th><th>Nominal values</th><th>Missing</th></tr></thead>
            <tbody>
              {attributes.map((attribute, index) => (
                <tr key={`${attribute.index ?? index}-${attribute.name}`}>
                  <td>{attribute.index ?? index}</td>
                  <td>{attribute.name || "Unnamed"}</td>
                  <td>{attribute.type || "Unknown"}</td>
                  <td>{Array.isArray(attribute.nominalValues) && attribute.nominalValues.length ? attribute.nominalValues.join(", ") : "—"}</td>
                  <td>{attribute.missingCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
