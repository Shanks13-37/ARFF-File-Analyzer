import assert from "node:assert/strict";
import test from "node:test";

// The upload module imports Prisma at module load time. Supplying a valid
// placeholder connection string lets these route-handler tests inject a fake
// client without opening a database connection.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { createUploadHandler } = await import("../api/uploads.js");

const validArff = `@relation demo
@attribute age numeric
@attribute class {yes,no}
@attribute note string
@attribute day date 'yyyy-MM-dd'
@data
21,yes,hello,2026-09-06`;

function makeFile(name, content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return { originalname: name, size: buffer.length, buffer };
}

function createDependencies() {
  const activity = [];
  const prismaClient = {
    dataset: {
      async create() {
        return { id: `dataset-${activity.length + 1}` };
      }
    }
  };
  return {
    prismaClient,
    activityLogger: async (...args) => activity.push(args),
    activity
  };
}

async function uploadFile(name, content) {
  const dependencies = createDependencies();
  const handler = createUploadHandler(dependencies);
  const req = { file: makeFile(name, content), user: { sub: "user-1" } };
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  await handler(req, response);
  return { response, dependencies };
}

test("valid ARFF upload returns complete analysis", async () => {
  const { response } = await uploadFile("demo.arff", validArff);
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.valid, true);
  assert.equal(response.body.relation, "demo");
  assert.equal(response.body.summary.instanceCount, 1);
  assert.equal(response.body.records[0].values[0], "21");
});

test("rejects non-ARFF uploads", async () => {
  const { response } = await uploadFile("demo.txt", validArff);
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.errors[0].code, "INVALID_FILE_EXTENSION");
});

test("rejects files over 10 MB", async () => {
  const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 97);
  const { response } = await uploadFile("large.arff", oversized);
  assert.equal(response.statusCode, 413);
  assert.equal(response.body.errors[0].code, "FILE_TOO_LARGE");
});

test("returns structured missing relation errors", async () => {
  const { response } = await uploadFile("missing-relation.arff", "@attribute a numeric\n@data\n1");
  assert.equal(response.statusCode, 422);
  assert.ok(response.body.errors.some((error) => error.code === "MISSING_RELATION"));
});

test("returns structured missing data errors", async () => {
  const { response } = await uploadFile("missing-data.arff", "@relation demo\n@attribute a numeric");
  assert.equal(response.statusCode, 422);
  assert.ok(response.body.errors.some((error) => error.code === "MISSING_DATA"));
});

test("returns incorrect row field-count errors", async () => {
  const { response } = await uploadFile("wrong-fields.arff", "@relation demo\n@attribute a numeric\n@attribute b numeric\n@data\n1");
  assert.equal(response.statusCode, 422);
  assert.ok(response.body.errors.some((error) => error.code === "WRONG_FIELD_COUNT"));
});

test("returns invalid numeric type violations", async () => {
  const { response } = await uploadFile("bad-number.arff", "@relation demo\n@attribute a numeric\n@data\nnot-a-number");
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.typeViolations[0].code, "INVALID_NUMERIC_VALUE");
  assert.equal(response.body.errors.length, 0);
});

test("returns invalid nominal type violations", async () => {
  const { response } = await uploadFile("bad-nominal.arff", "@relation demo\n@attribute a {yes,no}\n@data\nmaybe");
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.typeViolations[0].code, "INVALID_NOMINAL_VALUE");
});

test("returns missing-value counts", async () => {
  const { response } = await uploadFile("missing.arff", "@relation demo\n@attribute a numeric\n@attribute b string\n@data\n?,hello\n1,?");
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.missingValues.total, 2);
  assert.deepEqual(response.body.missingValues.byAttribute.map((entry) => entry.count), [1, 1]);
});

test("returns duplicate record groups", async () => {
  const { response } = await uploadFile("duplicates.arff", "@relation demo\n@attribute a numeric\n@data\n1\n1\n2");
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.summary.duplicateRecordCount, 1);
  assert.deepEqual(response.body.duplicates[0].recordIndices, [0, 1]);
});

test("returns mixed attribute analysis", async () => {
  const { response } = await uploadFile("mixed.arff", validArff);
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body.attributeTypeCounts, { numeric: 1, nominal: 1, string: 1, date: 1 });
});

test("handles a missing upload", async () => {
  const dependencies = createDependencies();
  const handler = createUploadHandler(dependencies);
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await handler({ user: { sub: "user-1" } }, response);
  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /choose an ARFF file/i);
});
