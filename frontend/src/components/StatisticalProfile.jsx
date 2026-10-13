import React, { useEffect, useState } from "react";

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const percentFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function value(value) {
  return value === null || value === undefined || Number.isNaN(value) ? "Unavailable" : numberFormat.format(value);
}

function percent(value) {
  return value === null || value === undefined ? "Unavailable" : `${percentFormat.format(value)}%`;
}

function NumericDetail({ profile }) {
  const stats = profile.statistics;
  if (!stats) return <p className="empty">No valid numeric observations are available for these statistics.</p>;
  const entries = [["Minimum", stats.minimum], ["Maximum", stats.maximum], ["Range", stats.range], ["Mean", stats.mean], ["Median", stats.median], ["Variance", stats.variance], ["Std. deviation", stats.standardDeviation], ["Q1", stats.q1], ["Q3", stats.q3], ["IQR", stats.iqr], ["5th percentile", stats.percentile5], ["95th percentile", stats.percentile95]];
  return <><div className="profileStatGrid">{entries.map(([label, item]) => <div key={label}><span>{label}</span><strong>{value(item)}</strong></div>)}</div><p className="profileNote">Outliers use the standard 1.5 × IQR fences ({value(profile.outliers.lowerFence)} to {value(profile.outliers.upperFence)}). {profile.outliers.count} detected{profile.outliers.sampleTruncated ? `; showing the first ${profile.outliers.sampleLimit}.` : "."}</p></>;
}

function CategoricalDetail({ profile }) {
  const frequencies = profile.frequencies;
  if (!frequencies) return null;
  return <div className="profileDetailGrid"><div><h4>{profile.type === "nominal" ? "Declared categories" : "Most frequent observed values"}</h4>{profile.type === "nominal" ? <ul className="profileList">{profile.declaredCategories.map((entry) => <li key={entry.value}><span title={entry.value}>{entry.value}</span><strong>{entry.count} ({percent(entry.percentage)})</strong></li>)}</ul> : <ul className="profileList">{frequencies.displayed.map((entry) => <li key={entry.value}><span title={entry.value}>{entry.value || "(empty)"}</span><strong>{entry.count} ({percent(entry.percentage)})</strong></li>)}</ul>}</div><div><h4>Frequency coverage</h4><p className="profileNote">{frequencies.totalDistinct} distinct observed values across {frequencies.totalObserved} valid observations. {frequencies.truncated ? `Only the ${frequencies.frequencyLimit} most frequent values are shown.` : "All observed values are shown."}</p>{profile.type === "string" && <p className="profileNote">Empty or whitespace-only strings: {profile.emptyOrWhitespaceCount}</p>}</div></div>;
}

export default function StatisticalProfile({ profile }) {
  const attributes = Array.isArray(profile?.attributes) ? profile.attributes : [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => setSelectedIndex(0), [profile]);
  const selected = attributes[selectedIndex];
  return <section className="analysisSection statisticalProfile" aria-labelledby="statistical-profile-heading">
    <div className="profileHeading"><div><p className="eyebrow">Advanced profiling</p><h2 id="statistical-profile-heading">Statistical profiling</h2><p className="profileIntro">A deterministic view of valid, invalid, missing, and distinct observations for every attribute.</p></div><span className="profileMethod">Population variance · linear percentile interpolation</span></div>
    {attributes.length === 0 ? <p className="empty">No attributes are available for profiling.</p> : <>
      <div className="analysisTableScroll"><table className="analysisTable profileTable"><thead><tr><th>Attribute</th><th>Type</th><th>Total</th><th>Valid</th><th>Invalid</th><th>Missing</th><th>Distinct</th><th>Key result</th></tr></thead><tbody>{attributes.map((entry) => <tr key={`${entry.index}-${entry.name}`}><td className="profileName" title={entry.name}>{entry.name}</td><td>{entry.type}</td><td>{entry.totalRecords}</td><td>{entry.validValueCount}</td><td>{entry.invalidValueCount}</td><td>{entry.missingCount} <small>({percent(entry.missingPercentage)})</small></td><td>{entry.distinctValueCount}</td><td>{entry.type === "numeric" || entry.type === "integer" || entry.type === "real" ? (entry.statistics ? `Mean ${value(entry.statistics.mean)}` : "Unavailable") : entry.type === "date" ? (entry.date ? `${entry.date.earliest.slice(0, 10)} – ${entry.date.latest.slice(0, 10)}` : "Unavailable") : entry.frequencies ? `${entry.frequencies.totalDistinct} values` : "Unavailable"}</td></tr>)}</tbody></table></div>
      <div className="profileDetail"><label htmlFor="profile-attribute">Inspect attribute</label><select id="profile-attribute" value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))}>{attributes.map((entry, index) => <option value={index} key={`${entry.index}-${entry.name}`}>{entry.name} · {entry.type}</option>)}</select>{selected && <div className="profileDetailBody"><div className="profileDetailMeta"><h3>{selected.name}</h3><span>{selected.validValueCount} valid · {selected.invalidValueCount} invalid · {selected.missingCount} missing · {selected.distinctValueCount} distinct</span></div>{selected.statistics ? <NumericDetail profile={selected} /> : selected.frequencies ? <CategoricalDetail profile={selected} /> : selected.date ? <p className="profileNote">Earliest: {selected.date.earliest}; latest: {selected.date.latest}; range: {value(selected.date.rangeMilliseconds / 86400000)} days.</p> : <p className="empty">No additional statistics are available for this attribute.</p>}</div>}</div>
    </>}
  </section>;
}
