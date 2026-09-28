import React from "react";

export default function PaginationControls({ page, pageCount, onPageChange }) {
  if (pageCount <= 1) return null;

  return (
    <div className="recordPagination" aria-label="Table pagination">
      <button className="secondaryButton" type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1}>Previous</button>
      <span>Page {page} of {pageCount}</span>
      <button className="secondaryButton" type="button" onClick={() => onPageChange(page + 1)} disabled={page === pageCount}>Next</button>
    </div>
  );
}
