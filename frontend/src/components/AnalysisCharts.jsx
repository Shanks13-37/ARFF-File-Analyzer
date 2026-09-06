import React from "react";
import { getMissingChartData, getTypeChartData } from "./analysisVisualData.js";

function Chart({ data, label, color, width = 560 }) {
  const height = 230;
  const chartTop = 20;
  const chartBottom = 170;
  const chartHeight = chartBottom - chartTop;
  const max = Math.max(1, ...data.map((entry) => entry.value));
  const slotWidth = width / Math.max(data.length, 1);
  const barWidth = Math.max(18, Math.min(56, slotWidth * 0.58));

  return (
    <div className="chartScroll">
      <svg className="analysisChart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <line className="chartAxis" x1="32" y1={chartBottom} x2={width - 16} y2={chartBottom} />
        {data.map((entry, index) => {
          const barHeight = (entry.value / max) * chartHeight;
          const x = 32 + slotWidth * index + (slotWidth - barWidth) / 2;
          const y = chartBottom - barHeight;
          return (
            <g key={`${entry.name || entry.type}-${entry.index ?? index}`}>
              <rect className="chartBar" fill={color} x={x} y={y} width={barWidth} height={Math.max(1, barHeight)} rx="4" />
              <text className="chartValue" x={x + barWidth / 2} y={Math.max(chartTop + 12, y - 6)} textAnchor="middle">{entry.value}</text>
              <text className="chartLabel" x={x + barWidth / 2} y={chartBottom + 20} textAnchor="middle">{entry.type || entry.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function AnalysisCharts({ analysisResult }) {
  const typeData = getTypeChartData(analysisResult);
  const missingData = getMissingChartData(analysisResult);
  const missingWidth = Math.max(560, missingData.length * 92);

  return (
    <div className="analysisCharts">
      <div className="chartCard">
        <h3>Attribute type distribution</h3>
        <Chart data={typeData} label="Number of attributes by type" color="#2563eb" />
      </div>
      <div className="chartCard">
        <h3>Missing values per attribute</h3>
        {missingData.length === 0 ? <p className="empty">No attributes available for charting.</p> : <Chart data={missingData} label="Missing values per attribute" color="#f97316" width={missingWidth} />}
      </div>
    </div>
  );
}
