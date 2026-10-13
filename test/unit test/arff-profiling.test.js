import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDataset } from "../../backend/arff/analyzer.js";
import { parseArff } from "../../backend/arff/parser.js";

function analyze(source) {
  const parsed = parseArff(source);
  assert.equal(parsed.valid, true, JSON.stringify(parsed.errors));
  return analyzeDataset(parsed.dataset);
}

test("profiles mixed numeric, nominal, string, and declared date attributes", () => {
  const result = analyze(`@relation mixed
@attribute amount real
@attribute color {red,blue,green}
@attribute note string
@attribute happened date 'yyyy-MM-dd'
@data
1.5,red,hello,2026-01-02
-2.5,red,"",2026-01-04
?,blue,"  ",?
bad,red,world,2026-01-01`);
  const [amount, color, note, happened] = result.statisticalProfile.attributes;
  assert.equal(amount.validValueCount, 2);
  assert.equal(amount.invalidValueCount, 1);
  assert.equal(amount.missingCount, 1);
  assert.equal(color.distinctValueCount, 2);
  assert.deepEqual(color.declaredCategories.map((entry) => entry.count), [3, 1, 0]);
  assert.equal(note.emptyOrWhitespaceCount, 2);
  assert.equal(happened.date.earliest, "2026-01-01T00:00:00.000Z");
  assert.equal(happened.date.latest, "2026-01-04T00:00:00.000Z");
});

test("uses linear interpolation and population variance for numeric statistics", () => {
  const numeric = analyze(`@relation stats
@attribute value numeric
@data
1
2
3
4`).statisticalProfile.attributes[0];
  assert.equal(numeric.statistics.minimum, 1);
  assert.equal(numeric.statistics.maximum, 4);
  assert.equal(numeric.statistics.mean, 2.5);
  assert.equal(numeric.statistics.median, 2.5);
  assert.equal(numeric.statistics.variance, 1.25);
  assert.equal(numeric.statistics.standardDeviation, Math.sqrt(1.25));
  assert.equal(numeric.statistics.q1, 1.75);
  assert.equal(numeric.statistics.q3, 3.25);
  assert.equal(numeric.statistics.iqr, 1.5);
  assert.ok(Math.abs(numeric.statistics.percentile5 - 1.15) < 1e-12);
  assert.ok(Math.abs(numeric.statistics.percentile95 - 3.85) < 1e-12);
});

test("handles a single valid observation and no usable values", () => {
  const result = analyze(`@relation edge
@attribute one numeric
@attribute none numeric
@data
-4.5,?
?,bad`);
  const [one, none] = result.statisticalProfile.attributes;
  assert.equal(one.statistics.median, -4.5);
  assert.equal(one.statistics.variance, 0);
  assert.equal(one.statistics.standardDeviation, 0);
  assert.equal(none.statistics, null);
  assert.equal(none.invalidValueCount, 1);
});

test("detects outliers and retains a bounded inspection sample", () => {
  const profile = analyze(`@relation outliers
@attribute value numeric
@data
1
2
2
3
100`).statisticalProfile.attributes[0];
  assert.equal(profile.statistics.iqr, 1);
  assert.equal(profile.outliers.count, 1);
  assert.deepEqual(profile.outliers.sample, [{ recordIndex: 4, value: "100" }]);
});

test("handles a zero-IQR distribution without suppressing genuine outliers", () => {
  const profile = analyze(`@relation flat
@attribute value numeric
@data
2
2
2
2
10`).statisticalProfile.attributes[0];
  assert.equal(profile.statistics.iqr, 0);
  assert.equal(profile.outliers.count, 1);
  assert.equal(profile.outliers.sample[0].value, "10");
});

test("does not confuse a quoted question mark with a missing marker", () => {
  const parsed = parseArff('@relation marks\n@attribute text string\n@data\n?\n"?"');
  assert.equal(parsed.valid, true);
  const result = analyzeDataset(parsed.dataset);
  assert.deepEqual(parsed.dataset.records.map((record) => record.values[0]), [null, "?"]);
  assert.equal(result.attributes[0].missingCount, 1);
  assert.equal(result.statisticalProfile.attributes[0].validValueCount, 1);
  assert.equal(result.statisticalProfile.attributes[0].frequencies.displayed[0].value, "?");
});
