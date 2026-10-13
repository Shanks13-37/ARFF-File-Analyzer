import multer from "multer";
import { requireRole } from "../backend/utils/auth.js";
import { parseArff } from "../backend/arff/parser.js";
import { analyzeDataset } from "../backend/arff/analyzer.js";
import { validateArffHeader } from "../backend/arff/headerValidator.js";
import { evaluateDataQuality } from "../backend/arff/qualityEvaluator.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const qualityUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE, fields: 1, fieldSize: 64 * 1024, files: 1 } });

export function createQualityEvaluationHandler() {
  return function evaluateQualityRequest(req, res) {
    if (!req.file || !req.file.originalname?.toLowerCase().endsWith(".arff")) {
      return res.status(400).json({ error: "Provide one .arff file using the file field." });
    }
    if (!Buffer.isBuffer(req.file.buffer)) return res.status(400).json({ error: "File could not be read." });
    if (req.file.size > MAX_FILE_SIZE || req.file.buffer.length > MAX_FILE_SIZE) return res.status(413).json({ error: "File is too large. Maximum allowed size is 10 MB." });
    let rules;
    try { rules = JSON.parse(req.body?.rules ?? "[]"); }
    catch { return res.status(400).json({ error: "Rules must contain valid JSON." }); }
    const header = validateArffHeader(req.file.buffer);
    if (!header.valid) return res.status(422).json({ error: "This is an invalid ARFF file.", errors: [{ code: header.code, section: "header", message: header.message }] });
    const parsed = parseArff(req.file.buffer);
    if (!parsed.dataset.relation || parsed.dataset.attributes.length === 0) {
      return res.status(422).json({ error: "The parsed file does not contain a usable schema.", errors: parsed.errors });
    }
    const analysis = analyzeDataset(parsed.dataset);
    const quality = evaluateDataQuality({ dataset: parsed.dataset, analysis, statisticalProfile: analysis.statisticalProfile, parserErrors: parsed.errors, rules });
    if (!quality.configurationValid) return res.status(400).json({ error: "One or more quality rules are invalid.", errors: quality.errors });
    return res.status(200).json({ file: { name: req.file.originalname, size: req.file.size }, parseValid: parsed.valid, qualityAssessment: quality });
  };
}

export function registerQualityRoutes(app) {
  app.post("/api/quality/evaluate", requireRole("USER"), qualityUpload.single("file"), createQualityEvaluationHandler());
}
