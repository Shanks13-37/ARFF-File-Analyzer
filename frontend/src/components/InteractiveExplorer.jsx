import React, { useMemo, useState } from "react";
import {
  CATEGORY_LIMIT, CORRELATION_ATTRIBUTE_LIMIT, HISTOGRAM_BINS,
  prepareCategoryFrequencies, prepareCorrelation, prepareDateDistribution,
  prepareHistogram, prepareScatter
} from "./explorationData.js";

const NUMERIC = new Set(["numeric", "real", "integer"]);
const numberFormat = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 5 });
const nfmt = (value) => numberFormat.format(value);

function Histogram({ data, attribute }) {
  if (!data.validCount) return <p className="empty">No valid numeric observations. Missing and invalid values are excluded.</p>;
  const width = 760; const left = 58; const plotWidth = width - left - 16;
  const max = Math.max(1, ...data.bins.map((bin) => bin.count)); const slot = plotWidth / data.bins.length;
  return <><div className="explorationChartScroll"><svg className="explorationSvg" viewBox="0 0 760 310" role="img" aria-label={"Histogram of " + attribute.name}>
    <line className="explorationAxis" x1={left} y1="250" x2="744" y2="250" />
    {data.bins.map((bin, index) => { const height = bin.count / max * 210; const x = left + index * slot + 1; return <g key={index}><title>{nfmt(bin.start) + " to " + nfmt(bin.end) + ": " + bin.count + " records"}</title><rect className="explorationBar" x={x} y={250 - height} width={Math.max(1, slot - 2)} height={height} rx="3" /><text className="explorationValue" x={x + slot / 2} y={Math.max(18, 250 - height - 8)} textAnchor="middle">{bin.count}</text><text className="explorationTick" x={x + slot / 2} y="272" textAnchor="middle">{index % Math.ceil(data.bins.length / 5) === 0 ? nfmt(bin.start) : ""}</text></g>; })}
    <text className="explorationAxisLabel" x="18" y="145" transform="rotate(-90 18 145)" textAnchor="middle">Record count</text><text className="explorationAxisLabel" x="400" y="302" textAnchor="middle">{attribute.name}</text>
  </svg></div><p className="explorationCaption">{data.validCount} valid · {data.missingCount} missing · {data.invalidCount} invalid · {HISTOGRAM_BINS} bins by default. Range {nfmt(data.minimum)}–{nfmt(data.maximum)}.</p></>;
}

function Categories({ data, attribute, onSelect }) {
  if (!data.validCount) return <p className="empty">No observed values are available.</p>;
  const width = Math.max(620, data.categories.length * 76); const slot = (width - 56) / data.categories.length;
  const max = Math.max(1, ...data.categories.map((item) => item.count)); const bar = Math.min(48, slot * 0.65);
  return <><div className="explorationChartScroll"><svg className="explorationSvg categorySvg" viewBox={"0 0 " + width + " 310"} role="group" aria-label={"Category frequencies for " + attribute.name}>
    <line className="explorationAxis" x1="42" y1="250" x2={width - 14} y2="250" />
    {data.categories.map((item, index) => { const x = 42 + slot * index + (slot - bar) / 2; const height = item.count / max * 210; const select = () => onSelect(attribute.index, item.value); return <g key={item.value} className="explorationCategory" role="button" tabIndex="0" aria-label={"Filter to " + (item.value || "empty string") + ", " + item.count + " records"} onClick={select} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } }}><title>{(item.value || "(empty string)") + ": " + item.count + " records. Select to filter."}</title><rect className="explorationBar" x={x} y={250 - height} width={bar} height={height} rx="3" /><text className="explorationValue" x={x + bar / 2} y={Math.max(27, 244 - height)} textAnchor="middle">{item.count}</text><text className="explorationTick" x={x + bar / 2} y="272" textAnchor="middle">{item.value.length > 10 ? item.value.slice(0, 9) + "…" : item.value || "(empty)"}</text></g>; })}
    <text className="explorationAxisLabel" x="18" y="145" transform="rotate(-90 18 145)" textAnchor="middle">Record count</text><text className="explorationAxisLabel" x={width / 2} y="302" textAnchor="middle">{attribute.name} · select a bar to filter</text>
  </svg></div><p className="explorationCaption">{data.validCount} observed · {data.missingCount} missing · {data.totalDistinct} distinct. {data.truncated ? "Showing the " + CATEGORY_LIMIT + " most frequent values." : "All observed values shown."} Select a bar to filter records.</p></>;
}

function Dates({ data }) {
  if (!data.validCount) return <p className="empty">No valid dates match the declared ARFF date format.</p>;
  const width = 760; const max = Math.max(1, ...data.points.map((entry) => entry.count));
  const points = data.points.map((entry, index) => ({ ...entry, x: data.points.length === 1 ? 380 : 58 + index * 686 / (data.points.length - 1), y: 250 - entry.count / max * 210 }));
  return <><div className="explorationChartScroll"><svg className="explorationSvg" viewBox="0 0 760 310" role="img" aria-label="Valid dates grouped by UTC month">
    <line className="explorationAxis" x1="58" y1="250" x2="744" y2="250" />{points.length > 1 && <polyline className="explorationLine" points={points.map((point) => point.x + "," + point.y).join(" ")} />}
    {points.map((point) => <g key={point.value}><title>{point.value + ": " + point.count + " records"}</title><circle className="explorationPoint" cx={point.x} cy={point.y} r="5" /><text className="explorationValue" x={point.x} y={Math.max(18, point.y - 10)} textAnchor="middle">{point.count}</text><text className="explorationTick" x={point.x} y="272" textAnchor="middle">{point.value}</text></g>)}
    <text className="explorationAxisLabel" x="18" y="145" transform="rotate(-90 18 145)" textAnchor="middle">Record count</text><text className="explorationAxisLabel" x="400" y="302" textAnchor="middle">Month (UTC)</text>
  </svg></div><p className="explorationCaption">Dates use the declared ARFF format and are grouped by UTC month. {data.missingCount} missing · {data.invalidCount} invalid.{data.truncated ? " Showing evenly spaced months." : ""}</p></>;
}

function Scatter({ data, xAttribute, yAttribute }) {
  if (!data.points.length) return <p className="empty">No rows have valid values on both selected axes.</p>;
  const left = 68; const right = 750; const top = 24; const bottom = 265;
  const xs = data.points.map((point) => point.x); const ys = data.points.map((point) => point.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const coord = (v, lo, hi, a, b) => { if (lo === hi) return (a + b) / 2; const scale = Math.max(1, Math.abs(lo), Math.abs(hi)); return a + ((v / scale - lo / scale) / (hi / scale - lo / scale)) * (b - a); };
  return <><div className="explorationChartScroll"><svg className="explorationSvg" viewBox="0 0 780 330" role="img" aria-label={"Scatter plot of " + yAttribute.name + " against " + xAttribute.name}>
    <line className="explorationAxis" x1={left} y1={bottom} x2={right} y2={bottom} /><line className="explorationAxis" x1={left} y1={top} x2={left} y2={bottom} />
    {data.points.map((point, index) => <circle className="explorationScatterPoint" key={point.recordIndex + "-" + index} cx={coord(point.x, minX, maxX, left, right)} cy={coord(point.y, minY, maxY, bottom, top)} r="4"><title>{"Record " + point.recordIndex + ": " + xAttribute.name + " = " + nfmt(point.x) + ", " + yAttribute.name + " = " + nfmt(point.y)}</title></circle>)}
    <text className="explorationTick" x={left} y="286" textAnchor="middle">{nfmt(minX)}</text><text className="explorationTick" x={right} y="286" textAnchor="middle">{nfmt(maxX)}</text><text className="explorationTick" x={left - 8} y={bottom} textAnchor="end">{nfmt(minY)}</text><text className="explorationTick" x={left - 8} y={top + 4} textAnchor="end">{nfmt(maxY)}</text>
    <text className="explorationAxisLabel" x="400" y="318" textAnchor="middle">{xAttribute.name}</text><text className="explorationAxisLabel" x="18" y="145" transform="rotate(-90 18 145)" textAnchor="middle">{yAttribute.name}</text>
  </svg></div><p className="explorationCaption">{data.validCount} eligible rows · {data.excludedCount} excluded for missing or invalid axis values. {data.sampled ? "Showing a deterministic sample of " + data.points.length + " (cap " + data.sampleLimit + ")." : "All eligible points shown."} Hover points for row details.</p></>;
}

function Correlation({ data }) {
  if (!data.attributes.length) return <p className="empty">No numeric attributes are available.</p>;
  return <><div className="analysisTableScroll correlationScroll"><table className="correlationTable"><thead><tr><th>Attribute</th>{data.attributes.map((attribute) => <th key={attribute.index} title={attribute.name}>{attribute.name}</th>)}</tr></thead><tbody>{data.attributes.map((attribute, row) => <tr key={attribute.index}><th title={attribute.name}>{attribute.name}</th>{data.matrix[row].map((cell, column) => { const c = cell.correlation; const color = c === null ? "rgba(148,163,184,.12)" : c >= 0 ? "rgba(37,99,235," + (0.1 + Math.abs(c) * 0.52) + ")" : "rgba(220,38,38," + (0.1 + Math.abs(c) * 0.48) + ")"; return <td key={column} title={data.attributes[column].name + ": " + (c === null ? "undefined" : c.toFixed(3)) + "; n=" + cell.count} style={{ backgroundColor: color }}><span>{c === null ? "—" : c.toFixed(2)}</span><small>n={cell.count}</small></td>; })}</tr>)}</tbody></table></div><p className="explorationCaption">Pearson correlation uses pairwise-complete numeric observations. Correlation does not imply causation; — indicates fewer than two pairs or zero variance. {data.sampled ? "Deterministic sample: " + data.rowsAnalyzed + " records (cap " + data.rowLimit + ")." : "All " + data.rowsAnalyzed + " records checked."}</p></>;
}

export default function InteractiveExplorer({ attributes = [], records = [], onCategorySelect }) {
  const numeric = useMemo(() => attributes.filter((attribute) => NUMERIC.has(String(attribute.type).toLowerCase())), [attributes]);
  const [distributionIndex, setDistributionIndex] = useState(attributes[0]?.index ?? "");
  const [xIndex, setXIndex] = useState(numeric[0]?.index ?? "");
  const [yIndex, setYIndex] = useState(numeric[1]?.index ?? numeric[0]?.index ?? "");
  const [corrIndices, setCorrIndices] = useState(() => numeric.slice(0, CORRELATION_ATTRIBUTE_LIMIT).map((attribute) => attribute.index));
  const attribute = attributes.find((entry) => entry.index === Number(distributionIndex));
  const type = String(attribute?.type || "").toLowerCase();
  const xAttribute = numeric.find((entry) => entry.index === Number(xIndex));
  const yAttribute = numeric.find((entry) => entry.index === Number(yIndex));
  const histogram = useMemo(() => attribute && NUMERIC.has(type) ? prepareHistogram(records, attribute) : null, [records, attribute, type]);
  const categories = useMemo(() => attribute && (type === "nominal" || type === "string") ? prepareCategoryFrequencies(records, attribute) : null, [records, attribute, type]);
  const dates = useMemo(() => attribute && type === "date" ? prepareDateDistribution(records, attribute) : null, [records, attribute, type]);
  const scatter = useMemo(() => xAttribute && yAttribute ? prepareScatter(records, xAttribute, yAttribute) : null, [records, xAttribute, yAttribute]);
  const correlation = useMemo(() => prepareCorrelation(records, attributes, corrIndices), [records, attributes, corrIndices]);
  if (!attributes.length) return null;
  const toggle = (index) => setCorrIndices((current) => current.includes(index) ? (current.length > 2 ? current.filter((entry) => entry !== index) : current) : (current.length < CORRELATION_ATTRIBUTE_LIMIT ? [...current, index] : current));
  return <section className="analysisSection interactiveExplorer" aria-labelledby="exploration-heading">
    <div className="explorationHeading"><div><p className="eyebrow">Explore the data</p><h2 id="exploration-heading">Interactive visual exploration</h2><p className="explorationIntro">Explore this file's distributions and numeric relationships. Charts and the record table reflect the active filter; profiling and quality remain dataset-wide.</p></div><span className="explorationRecordCount">{records.length.toLocaleString()} records in view</span></div>
    <div className="explorationPanel"><div className="explorationPanelHeading"><div><h3>Attribute distribution</h3><p>Choose a type-aware view of one attribute.</p></div><label className="field"><span>Attribute</span><select aria-label="Distribution attribute" value={distributionIndex} onChange={(event) => setDistributionIndex(event.target.value)}>{attributes.map((entry) => <option key={entry.index} value={entry.index}>{entry.name} · {entry.type}</option>)}</select></label></div>
      {attribute && NUMERIC.has(type) && <Histogram data={histogram} attribute={attribute} />}{attribute && (type === "nominal" || type === "string") && <Categories data={categories} attribute={attribute} onSelect={(index, value) => onCategorySelect?.({ attributeIndex: index, value })} />}{attribute && type === "date" && <Dates data={dates} />}{attribute && !NUMERIC.has(type) && !["nominal", "string", "date"].includes(type) && <p className="empty">This attribute type has no supported distribution view.</p>}
    </div>
    <div className="explorationPanel"><div className="explorationPanelHeading"><div><h3>Numeric relationship</h3><p>Rows with missing or invalid values on either axis are excluded.</p></div></div>{!numeric.length ? <p className="empty">A scatter plot requires a numeric attribute.</p> : <><div className="explorationControls"><label className="field"><span>Horizontal axis (X)</span><select value={xIndex} onChange={(event) => setXIndex(event.target.value)}>{numeric.map((entry) => <option key={entry.index} value={entry.index}>{entry.name}</option>)}</select></label><label className="field"><span>Vertical axis (Y)</span><select value={yIndex} onChange={(event) => setYIndex(event.target.value)}>{numeric.map((entry) => <option key={entry.index} value={entry.index}>{entry.name}</option>)}</select></label></div>{scatter && <Scatter data={scatter} xAttribute={xAttribute} yAttribute={yAttribute} />}</>}</div>
    <div className="explorationPanel"><div className="explorationPanelHeading"><div><h3>Pearson correlation</h3><p>Pairwise numeric observations; nominal values are never encoded as numbers.</p></div></div>{!numeric.length ? <p className="empty">No numeric attributes are available.</p> : <><fieldset className="correlationAttributePicker"><legend>Matrix attributes (choose 2–{CORRELATION_ATTRIBUTE_LIMIT})</legend>{numeric.map((entry) => <label key={entry.index}><input type="checkbox" checked={corrIndices.includes(entry.index)} disabled={corrIndices.includes(entry.index) ? corrIndices.length <= 2 : corrIndices.length >= CORRELATION_ATTRIBUTE_LIMIT} onChange={() => toggle(entry.index)} /><span>{entry.name}</span></label>)}</fieldset><Correlation data={correlation} /></>}</div>
  </section>;
}
