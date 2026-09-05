import fs from "fs";
import path from "path";

export async function extractText(filePath: string, fileType: string): Promise<string> {
  const ext = fileType.startsWith(".") ? fileType : `.${fileType}`;

  if (ext === ".pdf") {
    const pdf = await import("pdf-parse");
    const buffer = fs.readFileSync(filePath);
    const parseFn = (pdf as any).default || pdf;
    const data = await parseFn(buffer);
    return cleanText(data.text).slice(0, 15000);
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value).slice(0, 15000);
  }

  if ([".txt", ".md"].includes(ext)) {
    const buffer = fs.readFileSync(filePath);
    return cleanText(buffer.toString("utf-8")).slice(0, 15000);
  }

  throw new Error(`不支持的文件格式: ${ext}，支持 PDF / DOCX / TXT`);
}

// V4: 图片文件提取（返回 base64 编码供视觉 AI 解析）
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp"];

export function isImageFile(fileType: string): boolean {
  const ext = fileType.startsWith(".") ? fileType.toLowerCase() : `.${fileType.toLowerCase()}`;
  return IMAGE_EXTENSIONS.includes(ext);
}

export interface ImageExtractionResult {
  base64: string;
  mimeType: string;
  fileSize: number;
}

export function extractImageForAI(filePath: string): ImageExtractionResult {
  const ext = path.extname(filePath).toLowerCase();
  let mimeType = "image/png";
  if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
  else if (ext === ".webp") mimeType = "image/webp";
  else if (ext === ".bmp") mimeType = "image/bmp";

  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString("base64");
  const fileSize = buffer.length;

  return { base64, mimeType, fileSize };
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
