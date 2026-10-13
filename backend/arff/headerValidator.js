const INVALID_HEADER_MESSAGE = "This is an invalid ARFF file. Expected @RELATION, @ATTRIBUTE, and @DATA directives.";

/**
 * ARFF is a text format, so it has no reliable binary signature or MIME type.
 * Verify its required header directives instead of trusting the filename.
 */
export function validateArffHeader(content) {
  const source = Buffer.isBuffer(content) ? content.toString("utf8") : String(content ?? "");
  if (source.includes("\0")) {
    return { valid: false, code: "INVALID_ARFF_HEADER", message: INVALID_HEADER_MESSAGE };
  }

  const lines = source
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%"));

  if (!/^@relation\b/i.test(lines[0] || "")) {
    return { valid: false, code: "INVALID_ARFF_HEADER", message: INVALID_HEADER_MESSAGE };
  }

  let attributeCount = 0;
  for (const line of lines.slice(1)) {
    if (/^@attribute\b/i.test(line)) {
      attributeCount += 1;
      continue;
    }
    if (/^@data\b/i.test(line)) {
      return attributeCount > 0
        ? { valid: true }
        : { valid: false, code: "INVALID_ARFF_HEADER", message: INVALID_HEADER_MESSAGE };
    }
    // Header directives must be contiguous; ordinary content before @DATA is
    // a strong indication this is a different file format.
    return { valid: false, code: "INVALID_ARFF_HEADER", message: INVALID_HEADER_MESSAGE };
  }

  return { valid: false, code: "INVALID_ARFF_HEADER", message: INVALID_HEADER_MESSAGE };
}
