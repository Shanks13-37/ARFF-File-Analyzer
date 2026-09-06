const TYPE_KEYS = ["numeric", "nominal", "string", "date"];

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function getTypeChartData(analysisResult) {
  const counts = analysisResult?.attributeTypeCounts || {};
  return TYPE_KEYS.map((type) => ({ type, value: count(counts[type]) }));
}

export function getMissingChartData(analysisResult) {
  const attributes = Array.isArray(analysisResult?.attributes) ? analysisResult.attributes : [];
  const byAttribute = Array.isArray(analysisResult?.missingValues?.byAttribute)
    ? analysisResult.missingValues.byAttribute
    : [];

  return attributes.map((attribute, index) => ({
    index: attribute.index ?? index,
    name: attribute.name || `Attribute ${index}`,
    value: count(byAttribute[index]?.count ?? attribute.missingCount)
  }));
}

export function getReportSections(analysisResult) {
  return [
    "dataset statistics",
    "attribute type counts",
    "attribute information",
    "missing-value summary",
    "duplicate-record summary",
    "type-validation results",
    "statistical charts"
  ].map((section) => ({ section }));
}
