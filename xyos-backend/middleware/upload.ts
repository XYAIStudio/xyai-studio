import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "node:url";

// 上传目录
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, unique);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
      ".txt", ".md", ".csv", ".json", ".xml", ".html",
      ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
      ".zip", ".rar",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

export const UPLOAD_DIR = uploadDir;
