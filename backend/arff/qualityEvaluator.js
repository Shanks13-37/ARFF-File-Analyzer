import { isMissing, isNumericType, isValidNumeric, validateValue } from "./valueValidation.js";

export const MAX_RULES = 50;
export const MAX_ALLOWED_VALUES = 100;
export const FAILURE_DETAIL_LIMIT = 100;
const SEVERITIES = new Set(["error", "warning", "informational"]);
const RULE_TYPES = new Set(["required_value", "max_missing_percentage", "numeric_range", "unique_values", "allowed_values", "string_length", "row_count"]);

function ruleError(index, message) { return { index, message }; }

export function validateQualityRules(rules, attributes) {
  if (!Array.isArray(rules)) return { valid: false, errors: [ruleError(null, "Rules must be an array.")] };
  if (rules.length > MAX_RULES) return { valid: false, errors: [ruleError(null, `At most ${MAX_RULES} rules may be configured.`)] };
  const errors = [];
  const ids = new Set();
  rules.forEach((rule, index) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) { errors.push(ruleError(index, "Rule must be an object.")); return; }
    if (typeof rule.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(rule.id)) errors.push(ruleError(index, "Rule id must contain 1–80 letters, numbers, underscores, or hyphens."));
    else if (ids.has(rule.id)) errors.push(ruleError(index, `Rule id '${rule.id}' is duplicated.`));
    else ids.add(rule.id);
    if (typeof rule.name !== "string" || !rule.name.trim() || rule.name.length > 120) errors.push(ruleError(index, "Rule name must contain 1–120 characters."));
    for (const key of Object.keys(rule)) if (!["id", "name", "type", "severity", "enabled", "config"].includes(key)) errors.push(ruleError(index, `Unsupported rule field '${key}'.`));
    if (!RULE_TYPES.has(rule.type)) { errors.push(ruleError(index, "Unsupported rule type.")); return; }
    if (!SEVERITIES.has(rule.severity)) errors.push(ruleError(index, "Severity must be error, warning, or informational."));
    if (rule.enabled !== undefined && typeof rule.enabled !== "boolean") errors.push(ruleError(index, "Enabled must be a boolean."));
    const config = rule.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) { errors.push(ruleError(index, "Rule configuration is required.")); return; }
    const configKeys = {
      required_value: ["attribute"], max_missing_percentage: ["attribute", "threshold"],
      numeric_range: ["attribute", "minimum", "maximum", "inclusiveMinimum", "inclusiveMaximum"],
      unique_values: ["attribute"], allowed_values: ["attribute", "values"],
      string_length: ["attribute", "minimum", "maximum"], row_count: ["minimum", "maximum"]
    }[rule.type];
    for (const key of Object.keys(config)) if (!configKeys.includes(key)) errors.push(ruleError(index, `Unsupported configuration field '${key}'.`));
    const attributeRequired = rule.type !== "row_count";
    let attribute = null;
    if (attributeRequired) {
      const match = attributes.find((entry) => entry.name === config.attribute);
      if (!match) errors.push(ruleError(index, `Attribute '${String(config.attribute ?? "")}' does not exist.`));
      else attribute = match;
    }
    const finiteOptional = (key) => config[key] === undefined || (typeof config[key] === "number" && Number.isFinite(config[key]));
    if (rule.type === "max_missing_percentage") {
      if (!(typeof config.threshold === "number" && Number.isFinite(config.threshold) && config.threshold >= 0 && config.threshold <= 100)) errors.push(ruleError(index, "Missing percentage threshold must be between 0 and 100."));
    } else if (rule.type === "numeric_range") {
      if (!attribute || !isNumericType(attribute.type)) errors.push(ruleError(index, "Numeric range rules require a numeric, real, or integer attribute."));
      if (!finiteOptional("minimum") || !finiteOptional("maximum") || (config.minimum == null && config.maximum == null)) errors.push(ruleError(index, "Provide at least one finite numeric range bound."));
      if (config.minimum != null && config.maximum != null && config.minimum > config.maximum) errors.push(ruleError(index, "Minimum cannot exceed maximum."));
      for (const key of ["inclusiveMinimum", "inclusiveMaximum"]) if (config[key] !== undefined && typeof config[key] !== "boolean") errors.push(ruleError(index, `${key} must be a boolean.`));
    } else if (rule.type === "allowed_values") {
      if (!Array.isArray(config.values) || !config.values.length || config.values.length > MAX_ALLOWED_VALUES || config.values.some((value) => typeof value !== "string") || new Set(config.values).size !== config.values.length) errors.push(ruleError(index, `Allowed values must be a unique list of 1–${MAX_ALLOWED_VALUES} strings.`));
      if (!attribute) errors.push(ruleError(index, "Allowed values require an existing attribute."));
      if (Array.isArray(config.values) && config.values.some((value) => typeof value !== "string" || value.length > 500)) errors.push(ruleError(index, "Each allowed value must be a string of at most 500 characters."));
      if (attribute?.type === "nominal" && Array.isArray(config.values) && config.values.some((value) => !attribute.nominalValues.includes(value))) errors.push(ruleError(index, "Allowed values for a nominal attribute must be declared categories."));
      if (attribute && Array.isArray(config.values) && ["numeric", "real", "integer", "date"].includes(String(attribute.type).toLowerCase()) && config.values.some((value) => !validateValue(value, attribute))) errors.push(ruleError(index, "Each allowed value must be valid for the attribute's declared type."));
    } else if (rule.type === "string_length") {
      if (!attribute || String(attribute.type).toLowerCase() !== "string") errors.push(ruleError(index, "String length rules require a string attribute."));
      if (!Number.isInteger(config.minimum) || config.minimum < 0 || !Number.isInteger(config.maximum) || config.maximum < config.minimum || config.maximum > 100000) errors.push(ruleError(index, "String length bounds must be integers from 0 to 100000, with minimum no greater than maximum."));
    } else if (rule.type === "row_count") {
      if ((!Number.isInteger(config.minimum) && !Number.isInteger(config.maximum)) || (config.minimum !== undefined && (!Number.isInteger(config.minimum) || config.minimum < 0)) || (config.maximum !== undefined && (!Number.isInteger(config.maximum) || config.maximum < 0)) || (config.minimum !== undefined && config.maximum !== undefined && config.minimum > config.maximum)) errors.push(ruleError(index, "Row count requires valid non-negative integer bounds, with minimum no greater than maximum."));
    }
    if (["required_value", "unique_values"].includes(rule.type) && !attributeRequired) errors.push(ruleError(index, "This rule requires an attribute."));
  });
  return { valid: errors.length === 0, errors };
}

function recordEntries(dataset, attributeIndex) {
  return (dataset.records || []).map((record, position) => ({
    recordIndex: record?.index ?? position,
    value: record?.values?.[attributeIndex],
    missing: isMissing(record?.values?.[attributeIndex], record?.quotedValues?.[attributeIndex])
  }));
}

function evaluateRule(rule, dataset) {
  const records = Array.isArray(dataset.records) ? dataset.records : [];
  const attribute = rule.type === "row_count" ? null : dataset.attributes.find((entry) => entry.name === rule.config.attribute);
  const values = attribute ? recordEntries(dataset, attribute.index) : [];
  const failures = [];
  let explanation = "All checked values satisfy this rule.";
  const resultRule = { id: rule.id, name: rule.name.trim(), type: rule.type, severity: rule.severity, enabled: rule.enabled !== false, config: { ...rule.config } };
  if (records.length === 0 && rule.type !== "row_count") return { ...resultRule, status: "skipped", failureCount: 0, explanation: "No records are available to evaluate this attribute rule.", failureDetails: [], detailLimit: FAILURE_DETAIL_LIMIT, detailsTruncated: false };
  if (rule.type === "required_value") {
    values.filter((entry) => entry.missing).forEach((entry) => failures.push({ ...entry, reason: "Value is missing." }));
    explanation = failures.length ? `${failures.length} record(s) have a missing value.` : explanation;
  } else if (rule.type === "max_missing_percentage") {
    const count = values.filter((entry) => entry.missing).length;
    const percentage = records.length ? (count / records.length) * 100 : null;
    if (percentage !== null && percentage > rule.config.threshold) values.filter((entry) => entry.missing).forEach((entry) => failures.push({ ...entry, reason: `Missing percentage exceeds ${rule.config.threshold}%.` }));
    explanation = percentage === null ? "Missingness is unavailable because the dataset has no records." : `${percentage.toFixed(2)}% missing; allowed maximum is ${rule.config.threshold}%.`;
  } else if (rule.type === "numeric_range") {
    for (const entry of values) {
      if (entry.missing) continue;
      if (!isValidNumeric(entry.value, attribute.type)) { failures.push({ ...entry, reason: "Value is not valid for this numeric attribute." }); continue; }
      const number = Number(String(entry.value).trim());
      const below = rule.config.minimum != null && (rule.config.inclusiveMinimum === false ? number <= rule.config.minimum : number < rule.config.minimum);
      const above = rule.config.maximum != null && (rule.config.inclusiveMaximum === false ? number >= rule.config.maximum : number > rule.config.maximum);
      if (below || above) failures.push({ ...entry, reason: "Value is outside the configured range." });
    }
    explanation = failures.length ? `${failures.length} non-missing value(s) are invalid or outside the configured range.` : explanation;
  } else if (rule.type === "unique_values") {
    const firstRecords = new Map();
    for (const entry of values) {
      if (entry.missing) continue;
      const key = String(entry.value);
      if (firstRecords.has(key)) failures.push({ ...entry, reason: `Duplicates record ${firstRecords.get(key)}.` });
      else firstRecords.set(key, entry.recordIndex);
    }
    explanation = failures.length ? `${failures.length} repeated occurrence(s) found; missing values are excluded.` : "All non-missing values are unique.";
  } else if (rule.type === "allowed_values") {
    const allowed = new Set(rule.config.values);
    values.filter((entry) => !entry.missing && !allowed.has(entry.value)).forEach((entry) => failures.push({ ...entry, reason: "Value is not in the allowed list." }));
    explanation = failures.length ? `${failures.length} observed value(s) are not in the allowed list.` : explanation;
  } else if (rule.type === "string_length") {
    values.filter((entry) => !entry.missing).forEach((entry) => {
      const length = Array.from(String(entry.value)).length;
      if (length < rule.config.minimum || length > rule.config.maximum) failures.push({ ...entry, reason: `String length ${length} is outside ${rule.config.minimum}–${rule.config.maximum}.` });
    });
    explanation = failures.length ? `${failures.length} string value(s) are outside the configured length.` : explanation;
  } else if (rule.type === "row_count") {
    const count = records.length;
    if ((rule.config.minimum !== undefined && count < rule.config.minimum) || (rule.config.maximum !== undefined && count > rule.config.maximum)) failures.push({ recordIndex: null, value: count, reason: "Dataset row count is outside the configured bounds." });
    explanation = failures.length ? `${count} records are outside the configured row-count bounds.` : `${count} records satisfy the configured row-count bounds.`;
  }
  return { ...resultRule, status: failures.length ? "failed" : "passed", failureCount: failures.length, explanation, failureDetails: failures.slice(0, FAILURE_DETAIL_LIMIT).map(({ recordIndex, value, reason }) => ({ recordIndex, attributeName: attribute?.name ?? null, value: value === undefined ? null : (typeof value === "string" && value.length > 500 ? value.slice(0, 500) : value), valueTruncated: typeof value === "string" && value.length > 500, reason })), detailLimit: FAILURE_DETAIL_LIMIT, detailsTruncated: failures.length > FAILURE_DETAIL_LIMIT };
}

export function evaluateDataQuality({ dataset, analysis, statisticalProfile, parserErrors = [], rules = [] }) {
  if (!dataset || !Array.isArray(dataset.attributes) || !Array.isArray(dataset.records)) throw new TypeError("A parsed dataset with attributes and records is required.");
  const validated = validateQualityRules(rules, dataset.attributes);
  if (!validated.valid) return { configurationValid: false, errors: validated.errors };
  const records = dataset.records;
  const attributes = dataset.attributes;
  const cells = records.length * attributes.length;
  const missingCount = analysis?.summary?.missingValueCount ?? 0;
  const missingPercentage = cells ? (missingCount / cells) * 100 : null;
  const perAttribute = (analysis?.missingValues?.byAttribute || attributes.map((attribute, index) => ({ index: attribute.index ?? index, name: attribute.name, count: 0 }))).map((entry) => ({ attributeName: entry.name, totalRecords: records.length, missingCount: entry.count ?? 0, completenessPercentage: records.length ? ((records.length - (entry.count ?? 0)) / records.length) * 100 : null }));
  const duplicateRecordCount = analysis?.summary?.duplicateRecordCount ?? 0;
  const duplicateGroups = Array.isArray(analysis?.duplicates) ? analysis.duplicates.length : 0;
  const violations = Array.isArray(analysis?.typeViolations) ? analysis.typeViolations : [];
  const affectedViolationRecords = [...new Set(violations.map((entry) => entry.recordIndex).filter(Number.isInteger))];
  const schemaUsable = typeof dataset.relation === "string" && dataset.relation.length > 0 && attributes.length > 0;
  const evaluationResults = rules.map((rule) => rule.enabled === false ? { id: rule.id, name: rule.name.trim(), type: rule.type, severity: rule.severity, enabled: false, config: { ...rule.config }, status: "skipped", failureCount: 0, explanation: "Rule is disabled.", failureDetails: [], detailLimit: FAILURE_DETAIL_LIMIT, detailsTruncated: false } : evaluateRule(rule, dataset));
  const status = (isAvailable, passes) => !isAvailable ? "unavailable" : passes ? "passed" : "failed";
  const bySeverity = Object.fromEntries([...SEVERITIES].map((severity) => [severity, evaluationResults.filter((rule) => rule.severity === severity && rule.status === "failed").length]));
  const failedRules = evaluationResults.filter((rule) => rule.status === "failed").length;
  const activeRules = evaluationResults.filter((rule) => rule.status === "passed" || rule.status === "failed").length;
  const enabledRules = rules.filter((rule) => rule.enabled !== false).length;
  return {
    configurationValid: true,
    version: 1,
    score: null,
    scoreExplanation: "No aggregate score is shown because weighting syntax, validity, completeness, uniqueness, and user rules would impose subjective trade-offs.",
    summary: { recordCount: records.length, attributeCount: attributes.length, configuredRuleCount: rules.length, enabledRuleCount: enabledRules, evaluatedRuleCount: activeRules, passedRuleCount: evaluationResults.filter((rule) => rule.status === "passed").length, failedRuleCount: failedRules, skippedRuleCount: evaluationResults.filter((rule) => rule.status === "skipped").length, failureCountBySeverity: bySeverity },
    dimensions: {
      completeness: { status: status(cells > 0, missingCount === 0), totalCells: cells, missingCount, missingPercentage, denominator: "records × attributes; unavailable when there are no cells", attributes: perAttribute },
      validity: { status: status(attributes.length > 0, parserErrors.length === 0 && violations.length === 0), parserErrorCount: parserErrors.length, parserErrors: parserErrors.slice(0, FAILURE_DETAIL_LIMIT), typeViolationCount: violations.length, typeViolationDetails: violations.slice(0, FAILURE_DETAIL_LIMIT).map(({ recordIndex, attributeName, value, message }) => ({ recordIndex, attributeName, value: typeof value === "string" && value.length > 500 ? value.slice(0, 500) : value, valueTruncated: typeof value === "string" && value.length > 500, message })), affectedRecordCount: affectedViolationRecords.length, affectedAttributeCount: new Set(violations.map((entry) => entry.attributeIndex).filter(Number.isInteger)).size, affectedAttributeNames: [...new Set(violations.map((entry) => entry.attributeName).filter(Boolean))], affectedRecordIndices: affectedViolationRecords.slice(0, FAILURE_DETAIL_LIMIT), affectedSourceLines: [...new Set(parserErrors.map((entry) => entry.line).filter(Number.isInteger))].slice(0, FAILURE_DETAIL_LIMIT), detailsTruncated: affectedViolationRecords.length > FAILURE_DETAIL_LIMIT || parserErrors.length > FAILURE_DETAIL_LIMIT || violations.length > FAILURE_DETAIL_LIMIT, explanation: "Syntax errors describe document structure; type violations describe non-missing values that do not conform to their declared attribute type." },
      uniqueness: { status: status(records.length > 0, duplicateRecordCount === 0), duplicateRecordCount, duplicateGroupCount: duplicateGroups, duplicatePercentage: records.length ? (duplicateRecordCount / records.length) * 100 : null, denominator: "record count; numerator counts repeated occurrences after the first, not duplicate groups" },
    schemaConformance: { status: !schemaUsable ? "unavailable" : (attributes.every((attribute) => typeof attribute.name === "string" && attribute.name && typeof attribute.type === "string" && attribute.type) && !parserErrors.some((error) => ["MALFORMED_ATTRIBUTE", "DUPLICATE_ATTRIBUTE", "INVALID_DECLARATION_ORDER"].includes(error.code)) ? "passed" : "failed"), usable: schemaUsable, attributeCount: attributes.length, relation: dataset.relation ?? null, explanation: schemaUsable ? "The parser produced a relation and at least one interpretable attribute." : "A relation and at least one parsed attribute are required for schema assessment." },
      ruleCompliance: { status: activeRules === 0 ? "unavailable" : failedRules ? "failed" : "passed", configuredRuleCount: rules.length, passedRuleCount: evaluationResults.filter((rule) => rule.status === "passed").length, failedRuleCount: failedRules, skippedRuleCount: evaluationResults.filter((rule) => rule.status === "skipped").length, failureCountBySeverity: bySeverity }
    },
    ruleResults: evaluationResults,
    profileAvailable: Boolean(statisticalProfile?.version)
  };
}
