import React, { useEffect, useState } from "react";
import PaginationControls from "./PaginationControls.jsx";

const ROWS_PER_PAGE = 5;

export default function AttributeTable({ attributes = [] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.ceil(attributes.length / ROWS_PER_PAGE);
  const pageStart = (page - 1) * ROWS_PER_PAGE;
  const visibleAttributes = attributes.slice(pageStart, pageStart + ROWS_PER_PAGE);

  useEffect(() => setPage(1), [attributes]);

  return (
    <div className="analysisSection">
      <h2>Attribute information</h2>
      {attributes.length === 0 ? <p className="empty">No attributes were parsed.</p> : (
        <>
          <div className="analysisTableScroll">
            <table className="analysisTable">
              <thead><tr><th>Index</th><th>Name</th><th>Type</th><th>Nominal values</th><th>Missing</th></tr></thead>
              <tbody>{visibleAttributes.map((attribute, index) => (
                <tr key={`${attribute.index ?? pageStart + index}-${attribute.name}`}>
                  <td>{attribute.index ?? pageStart + index}</td>
                  <td>{attribute.name || "Unnamed"}</td>
                  <td>{attribute.type || "Unknown"}</td>
                  <td>{Array.isArray(attribute.nominalValues) && attribute.nominalValues.length ? attribute.nominalValues.join(", ") : "—"}</td>
                  <td>{attribute.missingCount ?? 0}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <PaginationControls page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
