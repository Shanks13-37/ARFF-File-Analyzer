import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Play, Save } from "lucide-react";
import PaginationControls from "./PaginationControls.jsx";

const TYPES = [
  ["required_value", "Required value"],
  ["max_missing_percentage", "Maximum missing percentage"],
  ["numeric_range", "Numeric range"],
  ["unique_values", "Unique values"],
  ["allowed_values", "Allowed values"],
  ["string_length", "String length"],
  ["row_count", "Row count"]
];
const API_URL = import.meta.env.VITE_API_URL ?? "";
const DIMENSIONS = [["completeness", "Completeness"], ["validity", "Validity"], ["uniqueness", "Uniqueness"], ["schemaConformance", "Schema conformance"], ["ruleCompliance", "Rule compliance"]];

function newDraft(type = "required_value", attributes = []) {
  const firstAttribute = attributes[0]?.name || "";
  const configs = {
    required_value: { attribute: firstAttribute },
    max_missing_percentage: { attribute: firstAttribute, threshold: "5" },
    numeric_range: { attribute: attributes.find((entry) => ["numeric", "real", "integer"].includes(entry.type))?.name || firstAttribute, minimum: "", maximum: "", inclusiveMinimum: true, inclusiveMaximum: true },
    unique_values: { attribute: firstAttribute },
    allowed_values: { attribute: firstAttribute, valuesText: "" },
    string_length: { attribute: attributes.find((entry) => entry.type === "string")?.name || firstAttribute, minimum: "0", maximum: "100" },
    row_count: { minimum: "", maximum: "" }
  };
  return { id: globalThis.crypto?.randomUUID?.() || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: TYPES.find(([key]) => key === type)?.[1] || "Quality rule", type, severity: "warning", enabled: true, config: configs[type] };
}

function statusLabel(status) {
  return ({ passed: "Passed", failed: "Failed", skipped: "Skipped", unavailable: "Unavailable" })[status] || "Not evaluated";
}

function compatibleAttributes(type, attributes) {
  if (type === "numeric_range") return attributes.filter((attribute) => ["numeric", "real", "integer"].includes(attribute.type));
  if (type === "string_length") return attributes.filter((attribute) => attribute.type === "string");
  if (type === "allowed_values") return attributes.filter((attribute) => ["string", "nominal", "numeric", "real", "integer", "date"].includes(attribute.type));
  return attributes;
}

function dimensionValue(key, dimension) {
  if (key === "completeness") return dimension.missingPercentage === null ? "Unavailable" : `${(100 - dimension.missingPercentage).toFixed(2)}% complete`;
  if (key === "validity") return `${dimension.typeViolationCount} type issue${dimension.typeViolationCount === 1 ? "" : "s"} · ${dimension.parserErrorCount} parse issue${dimension.parserErrorCount === 1 ? "" : "s"}`;
  if (key === "uniqueness") return dimension.duplicatePercentage === null ? "Unavailable" : `${dimension.duplicateRecordCount} repeated record(s) · ${dimension.duplicatePercentage.toFixed(2)}%`;
  if (key === "schemaConformance") return dimension.usable ? `${dimension.attributeCount} attribute(s) · ${dimension.relation}` : "No usable schema";
  const severities = dimension.failureCountBySeverity || {};
  return `${dimension.passedRuleCount} passed · ${dimension.failedRuleCount} failed · ${dimension.skippedRuleCount} skipped (error ${severities.error || 0}, warning ${severities.warning || 0}, info ${severities.informational || 0})`;
}

function buildConfig(draft) {
  const source = draft.config;
  if (draft.type === "required_value" || draft.type === "unique_values") return { attribute: source.attribute };
  if (draft.type === "max_missing_percentage") return { attribute: source.attribute, threshold: Number(source.threshold) };
  if (draft.type === "numeric_range") return { attribute: source.attribute, ...(source.minimum !== "" ? { minimum: Number(source.minimum) } : {}), ...(source.maximum !== "" ? { maximum: Number(source.maximum) } : {}), inclusiveMinimum: source.inclusiveMinimum, inclusiveMaximum: source.inclusiveMaximum };
  if (draft.type === "allowed_values") return { attribute: source.attribute, values: source.valuesText.split("\n").filter((value) => value !== "") };
  if (draft.type === "string_length") return { attribute: source.attribute, minimum: Number(source.minimum), maximum: Number(source.maximum) };
  return { ...(source.minimum !== "" ? { minimum: Number(source.minimum) } : {}), ...(source.maximum !== "" ? { maximum: Number(source.maximum) } : {}) };
}

export default function QualityAssessment({ result, token, sourceFile, rules = [], onRulesChange = () => {} }) {
  const attributes = Array.isArray(result?.attributes) ? result.attributes : [];
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [evaluation, setEvaluation] = useState(result?.qualityAssessment || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expandedRule, setExpandedRule] = useState(null);
  const [detailPage, setDetailPage] = useState(1);
  useEffect(() => {
    setEvaluation(result?.qualityAssessment || null);
    setExpandedRule(null);
    setDetailPage(1);
    setError("");
  }, [result]);
  const expanded = evaluation?.ruleResults?.find((rule) => rule.id === expandedRule);
  const pageCount = Math.max(1, Math.ceil((expanded?.failureDetails?.length || 0) / 10));
  const pageDetails = expanded?.failureDetails?.slice((detailPage - 1) * 10, detailPage * 10) || [];

  function editExisting(rule) {
    const config = { ...rule.config };
    if (rule.type === "allowed_values") config.valuesText = config.values.join("\n");
    setDraft({ ...rule, config });
    setEditingId(rule.id);
    setError("");
  }

  function saveDraft(event) {
    event.preventDefault();
    const config = buildConfig(draft);
    let message = "";
    if (!draft.name.trim()) message = "Enter a name for this rule.";
    else if (draft.type !== "row_count" && !compatibleAttributes(draft.type, attributes).some((attribute) => attribute.name === config.attribute)) message = "Select a compatible attribute in this dataset.";
    else if (draft.type === "max_missing_percentage" && (!Number.isFinite(config.threshold) || config.threshold < 0 || config.threshold > 100)) message = "Set a maximum missing percentage from 0 to 100.";
    else if (draft.type === "numeric_range" && ((config.minimum === undefined && config.maximum === undefined) || (config.minimum !== undefined && !Number.isFinite(config.minimum)) || (config.maximum !== undefined && !Number.isFinite(config.maximum)) || (config.minimum !== undefined && config.maximum !== undefined && config.minimum > config.maximum))) message = "Provide at least one valid numeric bound; minimum must not exceed maximum.";
    else if (draft.type === "allowed_values" && (!config.values.length || config.values.length > 100 || config.values.some((value) => value.length > 500) || new Set(config.values).size !== config.values.length)) message = "Provide 1–100 unique values, each no longer than 500 characters.";
    else if (draft.type === "allowed_values" && attributes.find((attribute) => attribute.name === config.attribute)?.type === "nominal" && config.values.some((value) => !attributes.find((attribute) => attribute.name === config.attribute).nominalValues.includes(value))) message = "Allowed values for a nominal attribute must be declared categories.";
    else if (draft.type === "allowed_values" && ["numeric", "real", "integer"].includes(attributes.find((attribute) => attribute.name === config.attribute)?.type) && config.values.some((value) => !value.trim() || !Number.isFinite(Number(value.trim())) || (attributes.find((attribute) => attribute.name === config.attribute).type === "integer" && !/^[+-]?\d+$/.test(value.trim())))) message = "Allowed numeric values must be finite and match the attribute type.";
    else if (draft.type === "string_length" && (!Number.isInteger(config.minimum) || !Number.isInteger(config.maximum) || config.minimum < 0 || config.maximum < config.minimum || config.maximum > 100000)) message = "Use whole character limits from 0 to 100000, with minimum no greater than maximum.";
    else if (draft.type === "row_count" && ((config.minimum === undefined && config.maximum === undefined) || (config.minimum !== undefined && (!Number.isInteger(config.minimum) || config.minimum < 0)) || (config.maximum !== undefined && (!Number.isInteger(config.maximum) || config.maximum < 0)) || (config.minimum !== undefined && config.maximum !== undefined && config.minimum > config.maximum))) message = "Provide a valid non-negative minimum or maximum row count.";
    if (message) { setError(message); return; }
    if (!editingId && rules.length >= 50) { setError("At most 50 rules may be configured."); return; }
    const saved = { id: draft.id, name: draft.name.trim(), type: draft.type, severity: draft.severity, enabled: draft.enabled, config };
    onRulesChange((current) => editingId ? current.map((rule) => rule.id === editingId ? saved : rule) : [...current, saved]);
    setDraft(null);
    setEditingId(null);
    setEvaluation(result?.qualityAssessment || null);
    setExpandedRule(null);
    setError("");
  }

  async function runRules() {
    if (!sourceFile) { setError("The source file is unavailable. Select the dataset again before evaluating rules."); return; }
    setBusy(true);
    setError("");
    setEvaluation(null);
    const form = new FormData();
    form.append("file", sourceFile);
    form.append("rules", JSON.stringify(rules));
    try {
      const response = await fetch(`${API_URL}/api/quality/evaluate`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (Array.isArray(data.errors)) setError(data.errors.map((entry) => entry.message).join(" "));
        else setError(data.error || "Quality evaluation failed. Please try again.");
        return;
      }
      setEvaluation(data.qualityAssessment);
      setExpandedRule(null);
      setDetailPage(1);
    } catch {
      setError("The quality evaluation service could not be reached.");
    } finally { setBusy(false); }
  }

  function changeType(type) { setDraft({ ...newDraft(type, attributes), name: TYPES.find(([key]) => key === type)?.[1] || "Quality rule" }); }
  function patchConfig(key, value) { setDraft((current) => ({ ...current, config: { ...current.config, [key]: value } })); }
  const dimensionData = evaluation?.dimensions || result?.qualityAssessment?.dimensions;

  return <section className="analysisSection qualityAssessment" aria-labelledby="quality-heading">
    <div className="qualityHeader"><div><p className="eyebrow">Data quality</p><h2 id="quality-heading">Quality assessment</h2><p>Structural validity, completeness, duplicate records, and your configured checks are reported independently.</p></div><span className="qualityNoScore">No aggregate score</span></div>
    <p className="qualityMethodNote">A single score would require subjective weights across different kinds of issues, so the assessment reports each dimension separately.</p>
    <div className="qualityDimensionGrid">{DIMENSIONS.map(([key, label]) => {
      const dimension = dimensionData?.[key];
      const status = dimension?.status || "unavailable";
      return <article className={`qualityDimension ${status}`} key={key}><span className="qualityDimensionLabel">{label}</span><strong>{statusLabel(status)}</strong><small>{dimension ? dimensionValue(key, dimension) : "Assessment unavailable"}</small>{key === "completeness" && dimension && <small>{dimension.missingCount} missing / {dimension.totalCells} cells</small>}</article>;
    })}</div>
    {dimensionData?.completeness?.attributes?.length > 0 && <details className="qualityBreakdown"><summary>Completeness by attribute</summary><div className="analysisTableScroll"><table className="analysisTable compactTable"><thead><tr><th>Attribute</th><th>Missing</th><th>Complete</th><th>Denominator</th></tr></thead><tbody>{dimensionData.completeness.attributes.map((entry) => <tr key={entry.attributeName}><td className="qualityObservedValue">{entry.attributeName}</td><td>{entry.missingCount} / {entry.totalRecords}</td><td>{entry.completenessPercentage === null ? "Unavailable" : `${entry.completenessPercentage.toFixed(2)}%`}</td><td>Parsed records</td></tr>)}</tbody></table></div></details>}
    <p className="qualityDenominatorNote">Completeness uses all parsed record-attribute cells. Per-attribute missingness uses parsed records. Duplicate percentage uses repeated row occurrences after the first divided by parsed record count.</p>

    <div className="qualityRuleHeading"><div><h3>Validation rules</h3><p>Rules are evaluated on this selected dataset. The same rules remain available as you switch between files in this batch. Missing values are excluded from uniqueness, allowed-value, string-length, and numeric-range checks.</p></div><button type="button" className="secondaryButton" onClick={() => { setDraft(newDraft("required_value", attributes)); setEditingId(null); setError(""); }} disabled={busy || rules.length >= 50}><Plus size={16} /> Add rule</button></div>
    {rules.length === 0 && !draft ? <div className="qualityEmpty">No user rules configured. Add a rule to check attribute requirements, ranges, or row counts.</div> : <div className="qualityRuleList">{rules.map((rule) => {
      const outcome = evaluation?.ruleResults?.find((entry) => entry.id === rule.id);
      return <article className="qualityRuleItem" key={rule.id}><div className="qualityRuleMain"><div><strong>{rule.name}</strong><span>{TYPES.find(([type]) => type === rule.type)?.[1]} · {rule.severity}</span></div><span className={`qualityStatus ${outcome?.status || "pending"}`}>{outcome ? (outcome.status === "skipped" ? (outcome.enabled ? "Skipped" : "Disabled") : statusLabel(outcome.status)) : rule.enabled ? "Not run" : "Disabled"}</span><span className="qualityFailures">{outcome ? `${outcome.failureCount} failure${outcome.failureCount === 1 ? "" : "s"}` : "—"}</span><div className="qualityRuleActions"><button type="button" className="linkButton" disabled={busy} onClick={() => { onRulesChange((current) => current.map((entry) => entry.id === rule.id ? { ...entry, enabled: !entry.enabled } : entry)); setEvaluation(result?.qualityAssessment || null); }}>{rule.enabled ? "Disable" : "Enable"}</button><button type="button" className="linkButton" disabled={busy} onClick={() => editExisting(rule)}>Edit</button><button type="button" className="linkButton dangerLink" disabled={busy} onClick={() => { onRulesChange((current) => current.filter((entry) => entry.id !== rule.id)); setEvaluation(result?.qualityAssessment || null); }}>Remove</button>{outcome?.status === "failed" && <button type="button" className="iconButton secondaryButton" disabled={busy} aria-expanded={expandedRule === rule.id} onClick={() => { setExpandedRule(expandedRule === rule.id ? null : rule.id); setDetailPage(1); }} aria-label={`Inspect ${rule.name} failures`}>{expandedRule === rule.id ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>}</div></div>{outcome && <p className="qualityRuleExplanation">{outcome.explanation}{outcome.detailsTruncated ? ` Showing ${outcome.detailLimit} affected records at most.` : ""}</p>}{expandedRule === rule.id && outcome && <div className="qualityFailureDetails"><div className="analysisTableScroll"><table className="analysisTable"><thead><tr><th>Record</th><th>Attribute</th><th>Observed value</th><th>Finding</th></tr></thead><tbody>{pageDetails.map((item, index) => <tr key={`${item.recordIndex}-${index}`}><td>{item.recordIndex ?? "Dataset"}</td><td>{item.attributeName || "—"}</td><td className="qualityObservedValue">{item.value === null ? "?" : String(item.value)}{item.valueTruncated ? "… (truncated)" : ""}</td><td>{item.reason}</td></tr>)}</tbody></table></div><PaginationControls page={detailPage} pageCount={pageCount} onPageChange={setDetailPage} /></div>}</article>;
    })}</div>}

    {draft && <form className="qualityRuleEditor" onSubmit={saveDraft}>
      <div className="qualityEditorHeading"><h3>{editingId ? "Edit rule" : "Configure rule"}</h3><button type="button" className="linkButton" onClick={() => { setDraft(null); setEditingId(null); }}>Cancel</button></div>
      <fieldset disabled={busy} className="qualityEditorFieldset"><div className="qualityFormGrid"><label>Rule type<select value={draft.type} onChange={(event) => changeType(event.target.value)}>{TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Rule name<input value={draft.name} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required /></label><label>Severity<select value={draft.severity} onChange={(event) => setDraft((current) => ({ ...current, severity: event.target.value }))}><option value="error">Error</option><option value="warning">Warning</option><option value="informational">Informational</option></select></label>
      {draft.type !== "row_count" && <label>Attribute<select value={draft.config.attribute} onChange={(event) => patchConfig("attribute", event.target.value)}><option value="">Select an attribute</option>{compatibleAttributes(draft.type, attributes).map((attribute) => <option key={attribute.name} value={attribute.name}>{attribute.name} · {attribute.type}</option>)}</select>{compatibleAttributes(draft.type, attributes).length === 0 && <small>No compatible attribute in this dataset.</small>}</label>}
      {draft.type === "max_missing_percentage" && <label>Maximum missing percentage (%)<input type="number" min="0" max="100" step="any" value={draft.config.threshold} onChange={(event) => patchConfig("threshold", event.target.value)} required /></label>}
      {draft.type === "numeric_range" && <><label>Minimum (optional)<input type="number" step="any" value={draft.config.minimum} onChange={(event) => patchConfig("minimum", event.target.value)} /></label><label>Maximum (optional)<input type="number" step="any" value={draft.config.maximum} onChange={(event) => patchConfig("maximum", event.target.value)} /></label><label className="qualityCheckbox"><input type="checkbox" checked={draft.config.inclusiveMinimum} onChange={(event) => patchConfig("inclusiveMinimum", event.target.checked)} /> Include minimum boundary</label><label className="qualityCheckbox"><input type="checkbox" checked={draft.config.inclusiveMaximum} onChange={(event) => patchConfig("inclusiveMaximum", event.target.checked)} /> Include maximum boundary</label></>}
      {draft.type === "allowed_values" && <label className="qualityWideField">Allowed values <small>One exact ARFF value per line. Capitalization and whitespace are preserved; numeric and date entries must match the declared attribute type.</small><textarea rows="4" maxLength={12000} value={draft.config.valuesText} onChange={(event) => patchConfig("valuesText", event.target.value)} required /></label>}
      {draft.type === "string_length" && <><label>Minimum characters<input type="number" min="0" max="100000" value={draft.config.minimum} onChange={(event) => patchConfig("minimum", event.target.value)} required /></label><label>Maximum characters<input type="number" min="0" max="100000" value={draft.config.maximum} onChange={(event) => patchConfig("maximum", event.target.value)} required /></label></>}
      {draft.type === "row_count" && <><label>Minimum records (optional)<input type="number" min="0" value={draft.config.minimum} onChange={(event) => patchConfig("minimum", event.target.value)} /></label><label>Maximum records (optional)<input type="number" min="0" value={draft.config.maximum} onChange={(event) => patchConfig("maximum", event.target.value)} /></label></>}
      </div><label className="qualityCheckbox"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /> Rule enabled</label></fieldset><div className="qualityEditorActions"><button type="submit" disabled={busy}><Save size={16} /> Save rule</button></div>
    </form>}

    {error && <div className="result failure" role="alert">{error}</div>}
    {evaluation?.ruleResults?.length > 0 && evaluation.summary?.enabledRuleCount === 0 && <p className="qualityEmpty">All configured rules are disabled. Enable at least one rule to evaluate compliance.</p>}
    {evaluation?.summary?.enabledRuleCount > 0 && evaluation.summary?.evaluatedRuleCount === 0 && <p className="qualityEmpty">No attribute rules could be evaluated because this dataset has no records.</p>}
    {evaluation?.summary?.evaluatedRuleCount > 0 && evaluation.summary.failedRuleCount === 0 && <p className="qualityStateMessage">All evaluated rules passed for this dataset.</p>}
    {evaluation?.summary?.failedRuleCount > 0 && <p className="qualityStateMessage failed">{evaluation.summary.failedRuleCount} rule(s) failed. Expand a failed rule to inspect its affected values.</p>}
    <div className="qualityRunRow"><span>{busy ? "Evaluating rules against the selected file…" : evaluation?.summary?.evaluatedRuleCount ? "Results reflect the current rule configuration and selected file." : "Run evaluation to apply the configured rules."}</span><button type="button" onClick={runRules} disabled={busy || Boolean(draft) || !sourceFile}>{busy ? "Evaluating…" : <><Play size={16} /> Run rules</>}</button></div>
  </section>;
}
