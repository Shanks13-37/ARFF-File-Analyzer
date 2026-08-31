import multer from "multer";
import { prisma } from "../backend/db.js";
import { requireRole } from "../backend/utils/auth.js";
import { logActivity } from "../backend/utils/activity.js";
import { validateArffFile } from "../backend/utils/arffValidator.js";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

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

    const validation = validateArffFile(file);
    const { valid, errors } = validation;

    let dataset;
    try {
      dataset = await prisma.dataset.create({
        data: {
          userId: req.user.sub,
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
