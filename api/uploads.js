import multer from "multer";
import { prisma } from "../backend/db.js";
import { requireRole } from "../backend/utils/auth.js";
import { logActivity } from "../backend/utils/activity.js";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

function validateArffFile(file) {
  const errors = [];
  if (!file?.originalname?.toLowerCase().endsWith(".arff")) {
    errors.push("Only files with the .arff extension are accepted.");
    return errors;
  }

  const content = file.buffer?.toString("utf8") || "";
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%"));
  const lowerLines = lines.map((line) => line.toLowerCase());
  const relationIndex = lowerLines.findIndex((line) => line.startsWith("@relation"));
  const attributeIndex = lowerLines.findIndex((line) => line.startsWith("@attribute"));
  const dataIndex = lowerLines.findIndex((line) => line.startsWith("@data"));

  if (relationIndex === -1) errors.push("Missing @RELATION declaration.");
  if (attributeIndex === -1) errors.push("Missing at least one @ATTRIBUTE declaration.");
  if (dataIndex === -1) errors.push("Missing @DATA section.");
  if (dataIndex !== -1 && attributeIndex !== -1 && dataIndex < attributeIndex) {
    errors.push("@DATA section must appear after @ATTRIBUTE declarations.");
  }
  if (dataIndex !== -1 && !lines.slice(dataIndex + 1).some((line) => !line.startsWith("@"))) {
    errors.push("Missing data rows after @DATA.");
  }

  return errors;
}

export function registerUploadRoutes(app) {
  app.post("/api/uploads/arff", requireRole("USER"), upload.single("file"), async (req, res) => {
    const file = req.file;

    if (!file) {
      await logActivity(req, "ARFF_UPLOAD_VALIDATION", "FAILURE", {
        reason: "No file received"
      }, req.user.sub);
      return res.status(400).json({
        valid: false,
        error: "Please choose an ARFF file before uploading."
      });
    }

    const errors = validateArffFile(file);
    const valid = errors.length === 0;

    let dataset;
    try {
      dataset = await prisma.dataset.create({
        data: {
          originalName: file.originalname,
          fileSize: file.size,
          valid,
          errors
        }
      });
    } catch (error) {
      console.error(error);
      return res.status(503).json({
        valid: false,
        error: "Upload storage is unavailable. Check the database connection."
      });
    }

    await logActivity(req, "ARFF_UPLOAD_VALIDATION", valid ? "SUCCESS" : "FAILURE", {
      datasetId: dataset.id,
      originalName: file.originalname,
      fileSize: file.size,
      errors
    }, req.user.sub);

    if (!valid) {
      return res.status(422).json({
        valid: false,
        datasetId: dataset.id,
        error: errors[0],
        errors
      });
    }

    return res.status(201).json({
      valid: true,
      datasetId: dataset.id,
      message: "File uploaded and validated successfully.",
      file: {
        name: file.originalname,
        size: file.size
      }
    });
  });
}
