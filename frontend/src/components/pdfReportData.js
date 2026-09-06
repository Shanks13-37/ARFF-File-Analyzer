export function getPdfFilename(relation) {
  const safeRelation = String(relation || "arff")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "arff";
  return `${safeRelation}-analysis-report.pdf`;
}

export function buildPdfReportData(analysisResult, generatedAt = new Date().toLocaleString()) {
  const attributes = Array.isArray(analysisResult?.attributes) ? analysisResult.attributes : [];
  const missingByAttribute = Array.isArray(analysisResult?.missingValues?.byAttribute)
    ? analysisResult.missingValues.byAttribute
    : [];
  const duplicates = Array.isArray(analysisResult?.duplicates) ? analysisResult.duplicates : [];
  const violations = Array.isArray(analysisResult?.typeViolations) ? analysisResult.typeViolations : [];
  const errors = Array.isArray(analysisResult?.errors) ? analysisResult.errors : [];

  return {
    title: "ARFF File Analysis Report",
    generatedAt,
    file: {
      name: analysisResult?.file?.name || "Unknown",
      size: analysisResult?.file?.size || 0,
      relation: analysisResult?.relation || "Unknown"
    },
    summary: {
      instanceCount: analysisResult?.summary?.instanceCount ?? 0,
      attributeCount: analysisResult?.summary?.attributeCount ?? 0,
      missingValueCount: analysisResult?.summary?.missingValueCount ?? 0,
      duplicateRecordCount: analysisResult?.summary?.duplicateRecordCount ?? 0
    },
    attributeTypeCounts: { ...(analysisResult?.attributeTypeCounts || {}) },
    attributes: attributes.map((attribute, index) => ({
      index: attribute.index ?? index,
      name: attribute.name || `Attribute ${index}`,
      type: attribute.type || "Unknown",
      nominalValues: Array.isArray(attribute.nominalValues) ? [...attribute.nominalValues] : [],
      missingCount: attribute.missingCount ?? 0
    })),
    missingValues: {
      total: analysisResult?.missingValues?.total ?? 0,
      byAttribute: missingByAttribute.map((entry, index) => ({
        index: entry.index ?? index,
        name: entry.name || `Attribute ${index}`,
        count: entry.count ?? 0
      }))
    },
    duplicates: duplicates.map((group) => ({
      recordIndices: Array.isArray(group.recordIndices) ? [...group.recordIndices] : [],
      duplicateRecordCount: group.duplicateRecordCount ?? 0
    })),
    typeViolations: violations.map((violation) => ({
      recordIndex: violation.recordIndex,
      attributeName: violation.attributeName || "Unknown",
      value: violation.value,
      sourceLine: violation.sourceLine,
      message: violation.message || "Invalid value."
    })),
    errors: errors.map((error) => ({
      code: error.code || "ERROR",
      line: error.line,
      section: error.section || "unknown",
      message: error.message || String(error)
    })),
    charts: {
      attributeTypes: ["numeric", "nominal", "string", "date"].map((type) => ({
        label: type,
        value: Number(analysisResult?.attributeTypeCounts?.[type]) || 0
      })),
      missingValues: attributes.map((attribute, index) => ({
        label: attribute.name || `Attribute ${index}`,
        value: Number(missingByAttribute[index]?.count ?? attribute.missingCount) || 0
      }))
    }
  };
}
