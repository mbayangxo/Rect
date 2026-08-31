import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const RESUME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  ...IMAGE_TYPES,
};

export async function savePublicUpload(
  file: File,
  folder: "photos" | "resumes",
) {
  const allowed = folder === "resumes" ? RESUME_TYPES : IMAGE_TYPES;
  const ext = allowed[file.type];
  if (!ext) {
    throw new Error("That file type is not allowed.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("File must be under 8MB.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  if (folder === "resumes") {
    const dir = path.join(process.cwd(), "data", "uploads", "resumes");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), bytes);
    return `/portal/resumes/${name}`;
  }
  const dir = path.join(process.cwd(), "public", "uploads", "photos");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/photos/${name}`;
}

const RESUME_CONTENT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export function resumeDiskPath(fileName: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
    return null;
  }
  return path.join(process.cwd(), "data", "uploads", "resumes", fileName);
}

export function resumeSearchPaths(fileName: string) {
  const primary = resumeDiskPath(fileName);
  if (!primary) {
    return [];
  }
  return [
    primary,
    path.join(process.cwd(), "public", "uploads", "resumes", fileName),
  ];
}

export function portalResumeHref(storedPath: string) {
  const file = storedPath.split("/").pop() ?? "";
  return file ? `/portal/resumes/${file}` : storedPath;
}

export function resumeContentType(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return RESUME_CONTENT[ext] ?? "application/octet-stream";
}

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return slug || `item-${Date.now()}`;
}

export function bodyFromTextarea(value: string) {
  const parts = value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  return JSON.stringify(parts.length > 0 ? parts : [value.trim()].filter(Boolean));
}

export function textareaFromBody(body: string) {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.join("\n\n");
    }
  } catch {
    // plain text
  }
  return body;
}
