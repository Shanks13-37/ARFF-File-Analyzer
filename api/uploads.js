import multer from "multer";
import { prisma } from "../backend/db.js";
import { requireRole } from "../backend/utils/auth.js";
import { logActivity } from "../backend/utils/activity.js";
import { parseArff } from "../backend/arff/parser.js";
import { analyzeDataset } from "../backend/arff/analyzer.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

function fileDescriptor(file) {
  return {
    name: file.originalname,
    size: file.size
  };
}

function structuredFileError(code, message) {
  return { code, line: null, section: "file", message };
}

/**
 * Process an uploaded ARFF file. Dependencies are injectable so this workflow
 * can be tested without connecting to PostgreSQL or writing activity logs.
 */
export function createUploadHandler({ prismaClient = prisma, activityLogger = logActivity } = {}) {
  return async function handleArffUpload(req, res) {
    const file = req.file;
    const userId = req.user?.sub;

    if (!file) {
      await activityLogger(req, "ARFF_UPLOAD_VALIDATION", "FAILURE", { stage: "upload", code: "MISSING_FILE", message: "No file received" }, userId);
      return res.status(400).json({
        valid: false,
        error: "Please choose an ARFF file before uploading."
      });
    }

    if (!file.originalname?.toLowerCase().endsWith(".arff")) {
      const error = structuredFileError("INVALID_FILE_EXTENSION", "Only files with the .arff extension are accepted.");
      let dataset;
      try {
        dataset = await prismaClient.dataset.create({
          data: {
            userId,
            originalName: file.originalname,
            fileSize: file.size,
            valid: false,
            errors: [error.message]
          }
        });
      } catch (storageError) {
        console.error(storageError);
        return res.status(503).json({ valid: false, error: "Upload storage is unavailable. Check the database connection." });
      }
      await activityLogger(req, "ARFF_UPLOAD_VALIDATION", "FAILURE", { stage: "upload", code: error.code, message: error.message }, userId);
      return res.status(422).json({ valid: false, datasetId: dataset.id, file: fileDescriptor(file), error: error.message, errors: [error] });
    }

    if (!Buffer.isBuffer(file.buffer)) {
      return res.status(400).json({ valid: false, error: "File could not be read." });
    }

    // Multer normally rejects this before the handler runs. This check keeps
    // the handler safe when called directly and documents the same boundary.
    if (file.size > MAX_FILE_SIZE || file.buffer.length > MAX_FILE_SIZE) {
      const error = structuredFileError("FILE_TOO_LARGE", "File is too large. Maximum allowed size is 10 MB.");
      await activityLogger(req, "ARFF_UPLOAD_VALIDATION", "FAILURE", { stage: "upload", code: error.code, message: error.message }, userId);
      return res.status(413).json({ valid: false, file: fileDescriptor(file), error: error.message, errors: [error] });
    }

    let parsed;
    let analysis;
    try {
      parsed = parseArff(file.buffer.toString("utf8"));
      analysis = analyzeDataset(parsed.dataset);
    } catch (error) {
      console.error(error);
      await activityLogger(req, "ARFF_UPLOAD_ANALYSIS", "FAILURE", {
        stage: "analysis",
        code: "ARFF_ANALYSIS_FAILED",
        message: error.message || "ARFF analysis failed."
      }, userId);
      return res.status(500).json({ valid: false, error: "The ARFF file could not be analyzed." });
    }
    const valid = parsed.valid && analysis.valid;
    const parserErrors = parsed.errors;
    const storedErrors = [
      ...parserErrors.map((error) => error.message),
      ...analysis.typeViolations.map((error) => error.message)
    ];

    let dataset;
    try {
      dataset = await prismaClient.dataset.create({
        data: {
          userId,
          originalName: file.originalname,
          fileSize: file.size,
          valid,
          errors: storedErrors
        }
      });
    } catch (error) {
      console.error(error);
      return res.status(503).json({
        valid: false,
        error: "Upload storage is unavailable. Check the database connection."
      });
    }

    await activityLogger(req, "ARFF_UPLOAD_VALIDATION", valid ? "SUCCESS" : "FAILURE", {
      datasetId: dataset.id,
      originalName: file.originalname,
      fileSize: file.size,
      errors: storedErrors,
      parserErrors,
      typeViolations: analysis.typeViolations
    }, userId);

    const response = {
      valid,
      datasetId: dataset.id,
      file: fileDescriptor(file),
      relation: parsed.dataset.relation,
      ...analysis,
      records: parsed.dataset.records,
      errors: parserErrors
    };

    if (!valid) {
      response.error = storedErrors[0] || "ARFF validation failed.";
      return res.status(422).json(response);
    }

    return res.status(201).json({
      ...response,
      message: "File uploaded and analyzed successfully."
    });
  };
}

export function registerUploadRoutes(app) {
  app.post("/api/uploads/arff", requireRole("USER"), upload.single("file"), createUploadHandler());
}
