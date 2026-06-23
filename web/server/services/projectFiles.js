import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { renameOutput } from "./outputRename.js";

function cleanPdfText(raw) {
  // Collapse runs of blank lines to double-newline (paragraph breaks)
  let text = raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");

  // Detect all-caps lines as headings (at least 4 chars, mostly uppercase)
  const lines = text.split("\n");
  const cleaned = lines.map((line) => {
    const trimmed = line.trim();
    if (
      trimmed.length >= 4 &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed) &&
      !/^\d+$/.test(trimmed)
    ) {
      // Title-case it and make it a heading
      const titleCased = trimmed
        .toLowerCase()
        .replace(/\b[a-z]/g, (c) => c.toUpperCase());
      return `\n## ${titleCased}\n`;
    }
    return line;
  });

  return cleaned.join("\n").trim();
}

export function createProjectFileService({
  WEB_ROOT,
  MAX_FILE_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_SEARCH_RESULTS,
  humanFiles,
  hashText,
  humanizePathSegment,
  httpError,
}) {
  const searchCacheTtlMs = 5_000;
  let searchAllowlistCache = null;
  const searchCandidateCache = new Map();
  const previewableExtensions = new Set([
    ".css",
    ".csv",
    ".html",
    ".js",
    ".json",
    ".md",
    ".txt",
    ".ts",
    ".tsx",
    ".tsv",
    ".xml",
    ".yaml",
    ".yml",
  ]);

  function isPathInsideRoot(root, candidate) {
    return candidate === root || candidate.startsWith(`${root}${path.sep}`);
  }

  function isPreviewablePath(relativePath) {
    return previewableExtensions.has(path.extname(relativePath).toLowerCase());
  }

  /** Returns true for `.pdf.md` companion files created by PDF extraction. */
  function isPdfExtractionFile(relativePath) {
    return relativePath.toLowerCase().endsWith(".pdf.md");
  }

  function isHiddenProjectPath(relativePath) {
    return relativePath.split("/").some((segment) => segment.startsWith("."));
  }

  function isChatContextReadablePath(relativePath, previewable = true) {
    if (!previewable) return false;
    return (
      relativePath === "project.md" ||
      relativePath === "questions.md" ||
      /^human_[^/]+\.md$/i.test(relativePath) ||
      relativePath.startsWith("inputs_human/") ||
      relativePath.startsWith("sources/") ||
      relativePath.startsWith("inputs_ai/") ||
      relativePath.startsWith("outputs_ai/") ||
      relativePath.startsWith("artifacts/artifact_specs/")
    );
  }

  function hasTraversalSegment(relativePath) {
    return String(relativePath ?? "")
      .replaceAll("\\", "/")
      .split("/")
      .some((segment) => segment === "..");
  }

  function projectFileItem(rootRelative, relative, meta, stat) {
    const previewable = isPreviewablePath(relative);

    return {
      path: meta.path,
      name: relative.replace(`${rootRelative}/`, ""),
      kind: meta.kind,
      editable: meta.editable && previewable,
      annotation: meta.annotation,
      chatContextReadable: isChatContextReadablePath(meta.path, previewable),
      modifiedAt: stat.mtime.toISOString(),
      previewable,
    };
  }

  async function fileExists(absolutePath) {
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async function rejectSymlinkEntry(absolutePath) {
    const stat = await fs.lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      throw httpError("Symlinked project paths cannot be managed in the lab UI.", 403, "path_symlink");
    }
    return stat;
  }

  function projectPath(projectRoot, relativePath) {
    if (hasTraversalSegment(relativePath)) {
      throw httpError("Path escapes the project root.", 403, "path_escape");
    }

    const normalized = path.normalize(String(relativePath ?? ""));
    const absolute = path.resolve(projectRoot, normalized);

    if (!isPathInsideRoot(projectRoot, absolute)) {
      throw httpError("Path escapes the project root.", 403, "path_escape");
    }

    return { absolute, relative: path.relative(projectRoot, absolute).replaceAll(path.sep, "/") };
  }

  async function resolveProjectFileTarget(projectRoot, relativePath, { allowMissing = false } = {}) {
    const target = projectPath(projectRoot, relativePath);
    const projectRootReal = await fs.realpath(projectRoot);
    let parentReal;
    try {
      parentReal = await fs.realpath(path.dirname(target.absolute));
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissing) {
        // Parent directory doesn't exist yet — create it and verify it's inside the project root
        await fs.mkdir(path.dirname(target.absolute), { recursive: true });
        parentReal = await fs.realpath(path.dirname(target.absolute));
      } else {
        throw error;
      }
    }

    if (!isPathInsideRoot(projectRootReal, parentReal)) {
      throw httpError("Path escapes the project root.", 403, "path_escape");
    }

    try {
      const linkStat = await fs.lstat(target.absolute);
      if (linkStat.isSymbolicLink()) {
        throw httpError("Symlinked project files cannot be managed in the lab UI.", 403, "path_symlink");
      }

      const targetReal = await fs.realpath(target.absolute);
      if (!isPathInsideRoot(projectRootReal, targetReal)) {
        throw httpError("Path escapes the project root.", 403, "path_escape");
      }
    } catch (error) {
      if (error?.statusCode) throw error;
      if (error?.code === "ENOENT" && allowMissing) return target;
      throw error;
    }

    return target;
  }

  async function resolveProjectDirectory(projectRoot, relativePath, { allowMissing = false } = {}) {
    const target = projectPath(projectRoot, relativePath);
    const projectRootReal = await fs.realpath(projectRoot);

    try {
      const linkStat = await fs.lstat(target.absolute);
      if (linkStat.isSymbolicLink()) {
        throw httpError("Symlinked project directories cannot be managed in the lab UI.", 403, "path_symlink");
      }

      const targetReal = await fs.realpath(target.absolute);
      if (!isPathInsideRoot(projectRootReal, targetReal)) {
        throw httpError("Path escapes the project root.", 403, "path_escape");
      }
    } catch (error) {
      if (error?.statusCode) throw error;
      if (error?.code === "ENOENT" && allowMissing) return target;
      throw error;
    }

    return target;
  }

  function classifyPath(projectRoot, relativePath) {
    const normalized = projectPath(projectRoot, relativePath).relative;
    const human = humanFiles.get(normalized);

    if (human) {
      return { path: normalized, ...human };
    }

    // v2 user-owned files
    if (normalized === "project.md") {
      return { path: normalized, kind: "human", editable: true, annotation: false };
    }

    // v2 AI-managed files
    if (normalized === "questions.md") {
      return { path: normalized, kind: "human", editable: true, annotation: false };
    }

    if (normalized === ".kiss_ai/external_repos.json") {
      return { path: normalized, kind: "human", editable: true, annotation: false };
    }

    if (/^human_[^/]+\.md$/i.test(normalized)) {
      return { path: normalized, kind: "human", editable: true, annotation: false };
    }

    // v2 sources (AI-managed, annotation-mode — not directly editable)
    if (normalized.startsWith("sources/")) {
      return { path: normalized, kind: "ai", editable: false, annotation: true };
    }

    // v1 backwards compatibility (AI-managed, annotation-mode — not directly editable)
    if (normalized.startsWith("inputs_ai/")) {
      return { path: normalized, kind: "ai", editable: false, annotation: true };
    }

    if (normalized.startsWith("outputs_ai/wiki/")) {
      return { path: normalized, kind: "output", editable: false, annotation: true };
    }

    if (normalized.startsWith("outputs_ai/")) {
      return { path: normalized, kind: "output", editable: true, annotation: true };
    }

    if (normalized.startsWith("inputs_human/")) {
      return { path: normalized, kind: "human", editable: true, annotation: false, previewable: isPreviewablePath(normalized) };
    }

    // Artifact spec files — editable by user and right-panel agent
    if (normalized.startsWith("artifacts/artifact_specs/")) {
      return { path: normalized, kind: "human", editable: true, annotation: false };
    }

    if (normalized.startsWith("change_logs/")) {
      return { path: normalized, kind: "log", editable: false, annotation: false, previewable: isPreviewablePath(normalized) };
    }

    throw httpError("Path is not allowlisted for the lab UI.", 403, "path_not_allowlisted");
  }

  async function readProjectJson(projectRoot, relativePath, fallback = null) {
    let absolute;
    try {
      ({ absolute } = await resolveProjectFileTarget(projectRoot, relativePath, { allowMissing: fallback !== undefined }));
    } catch (error) {
      if (error?.code === "ENOENT" && fallback !== undefined) return fallback;
      throw error;
    }
    try {
      return JSON.parse(await fs.readFile(absolute, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return fallback;
      if (error instanceof SyntaxError) {
        throw httpError(`Could not parse ${relativePath}. Fix or remove the corrupt JSON file.`, 500, "corrupt_project_json");
      }
      throw error;
    }
  }

  async function writeProjectJson(projectRoot, relativePath, value) {
    const { absolute } = await resolveProjectFileTarget(projectRoot, relativePath, { allowMissing: true });
    await fs.writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return value;
  }

  async function readTextFile(projectRoot, relativePath) {
    const meta = classifyPath(projectRoot, relativePath);
    const { absolute } = await resolveProjectFileTarget(projectRoot, meta.path);
    const stat = await fs.stat(absolute);

    // For PDF files in inputs_human/, serve the extracted .pdf.md companion if it exists.
    if (meta.path.startsWith("inputs_human/") && meta.path.toLowerCase().endsWith(".pdf")) {
      const mdPath = `${meta.path}.md`;
      try {
        const mdTarget = await resolveProjectFileTarget(projectRoot, mdPath);
        const mdContent = await fs.readFile(mdTarget.absolute, "utf8");
        return {
          ...meta,
          editable: false,
          content: mdContent,
          contentHash: hashText(mdContent),
        };
      } catch {
        // No extraction file — fall through to normal previewable check.
      }
    }

    if (meta.previewable === false) {
      throw httpError("This file type is saved in the project but cannot be previewed in the lab UI.", 415, "file_not_previewable");
    }

    if (stat.size > MAX_FILE_BYTES) {
      throw httpError("File is too large to open in the lab UI.", 413, "file_too_large");
    }

    const content = await fs.readFile(absolute, "utf8");

    return {
      ...meta,
      content,
      contentHash: hashText(content),
    };
  }

  async function writeTextFile(projectRoot, relativePath, content, { expectedContentHash = null } = {}) {
    const meta = classifyPath(projectRoot, relativePath);

    if (!meta.editable && !meta.annotation) {
      throw httpError("This file is read-only in the lab UI.", 403, "file_read_only");
    }

    if (meta.previewable === false) {
      throw httpError("This file type is saved in the project but cannot be edited in the lab UI.", 415, "file_not_previewable");
    }

    const { absolute } = await resolveProjectFileTarget(projectRoot, meta.path, { allowMissing: true });
    let currentContent = "";
    try {
      currentContent = await fs.readFile(absolute, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    if (!expectedContentHash) {
      throw httpError("Saving requires the content hash from the loaded file.", 428, "file_hash_required");
    }

    if (hashText(currentContent) !== expectedContentHash) {
      throw httpError("This file changed after it was loaded. Refresh the file before saving.", 409, "file_changed");
    }

    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
      throw httpError("File is too large to save in the lab UI.", 413, "file_too_large");
    }

    await fs.writeFile(absolute, content, "utf8");
    invalidateSearchCache(projectRoot);
    return readTextFile(projectRoot, meta.path);
  }

  async function listMarkdownFiles(projectRoot, rootRelative, kind, editable, annotation) {
    const root = await resolveProjectDirectory(projectRoot, rootRelative, { allowMissing: true });
    const files = [];

    async function walk(currentAbsolute) {
      const entries = await fs.readdir(currentAbsolute, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

        const absolute = path.join(currentAbsolute, entry.name);
        const relative = path.relative(projectRoot, absolute).replaceAll(path.sep, "/");
        await rejectSymlinkEntry(absolute);

        if (entry.isDirectory()) {
          await walk(absolute);
          continue;
        }

        if (!entry.name.endsWith(".md")) continue;

        const stat = await fs.stat(absolute);
        let fileEditable = editable;
        let fileKind = kind;
        let fileAnnotation = annotation;
        try {
          const meta = classifyPath(projectRoot, relative);
          fileEditable = meta.editable;
          fileKind = meta.kind;
          fileAnnotation = meta.annotation;
        } catch { /* fall back to tree-root defaults */ }
        files.push({
          path: relative,
          name: relative.replace(`${root.relative}/`, ""),
          kind: fileKind,
          editable: fileEditable,
          annotation: fileAnnotation,
          chatContextReadable: isChatContextReadablePath(relative),
          modifiedAt: stat.mtime.toISOString(),
          previewable: true,
        });
      }
    }

    try {
      await walk(root.absolute);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  async function listProjectFiles(projectRoot, rootRelative) {
    const root = await resolveProjectDirectory(projectRoot, rootRelative, { allowMissing: true });
    const files = [];
    const emptyDirectories = [];

    async function walk(currentAbsolute, currentRelativeDirName) {
      const entries = await fs.readdir(currentAbsolute, { withFileTypes: true });
      let hasVisibleEntries = false;

      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

        const absolute = path.join(currentAbsolute, entry.name);
        const relative = path.relative(projectRoot, absolute).replaceAll(path.sep, "/");
        await rejectSymlinkEntry(absolute);

        if (entry.isDirectory()) {
          hasVisibleEntries = true;
          await walk(absolute, relative.replace(`${root.relative}/`, ""));
          continue;
        }

        if (isHiddenProjectPath(relative)) continue;
        // Hide .pdf.md extraction companion files — they are internal to the agent.
        if (isPdfExtractionFile(relative)) continue;

        hasVisibleEntries = true;
        const meta = classifyPath(projectRoot, relative);
        const stat = await fs.stat(absolute);
        files.push(projectFileItem(root.relative, relative, meta, stat));
      }

      if (!hasVisibleEntries && currentRelativeDirName) {
        emptyDirectories.push({
          path: `${root.relative}/${currentRelativeDirName}`,
          name: currentRelativeDirName,
        });
      }
    }

    try {
      await walk(root.absolute, "");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    // Mark PDF files as previewable when a .pdf.md extraction companion exists.
    for (const file of files) {
      if (file.previewable === false && file.path.toLowerCase().endsWith(".pdf")) {
        const mdCompanion = path.join(projectRoot, `${file.path}.md`);
        if (await fileExists(mdCompanion)) {
          file.previewable = true;
        }
      }
    }

    return {
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      emptyDirectories: emptyDirectories.sort(),
    };
  }

  function safeUploadFileName(rawName) {
    const baseName = path.basename(String(rawName ?? "").replaceAll("\\", "/")).trim();
    const safeName = baseName.replace(/[\x00-\x1f<>:"|?*]/g, "_");

    if (!safeName || safeName === "." || safeName === "..") {
      throw httpError("Uploaded files need a valid filename.", 400, "invalid_upload_filename");
    }

    return safeName;
  }

  async function uploadHumanInputFiles(projectRoot, rawFiles) {
    const files = Array.isArray(rawFiles) ? rawFiles : [];

    if (!files.length) {
      throw httpError("Upload requires at least one file.", 400, "upload_empty");
    }

    const uploaded = [];

    for (const rawFile of files) {
      const name = safeUploadFileName(rawFile?.name);
      const contentBase64 = typeof rawFile?.contentBase64 === "string" ? rawFile.contentBase64 : "";
      const buffer = Buffer.from(contentBase64, "base64");

      if (!contentBase64 || buffer.length === 0) {
        throw httpError(`Uploaded file ${name} is empty or invalid.`, 400, "invalid_upload_content");
      }

      if (buffer.length > MAX_UPLOAD_BYTES) {
        throw httpError(`Uploaded file ${name} is too large.`, 413, "upload_too_large");
      }

      // ── Zip extraction ─────────────────────────────────────────────
      if (name.toLowerCase().endsWith(".zip")) {
        const extractedFiles = await extractZipToHumanInputs(projectRoot, name, buffer);
        uploaded.push(...extractedFiles);
        continue;
      }

      const target = projectPath(projectRoot, `inputs_human/${name}`);
      await fs.mkdir(path.dirname(target.absolute), { recursive: true });
      const { absolute, relative } = await resolveProjectFileTarget(projectRoot, target.relative, { allowMissing: true });
      await fs.writeFile(absolute, buffer);

      const meta = classifyPath(projectRoot, relative);
      const stat = await fs.stat(absolute);
      const fileItem = projectFileItem("inputs_human", relative, meta, stat);

      if (name.toLowerCase().endsWith(".pdf")) {
        await extractPdfCompanion(projectRoot, name, buffer, fileItem);
      }

      uploaded.push(fileItem);
    }

    invalidateSearchCache(projectRoot);
    return { files: uploaded };
  }

  /**
   * Extract a .zip buffer into inputs_human/<folderName>/ and return
   * the list of extracted project file items.
   */
  async function extractZipToHumanInputs(projectRoot, zipName, buffer) {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    // Folder name = zip filename without .zip extension
    const folderName = zipName.replace(/\.zip$/i, "");
    const safeFolderName = folderName.replace(/[<>:"|?*\x00-\x1f]/g, "_");
    const folderRelative = `inputs_human/${safeFolderName}`;
    const folderTarget = projectPath(projectRoot, folderRelative);
    await fs.mkdir(folderTarget.absolute, { recursive: true });

    const extracted = [];

    for (const entry of entries) {
      // Skip directories (they're created implicitly via mkdir)
      if (entry.isDirectory) continue;

      // Normalize the entry path (strip leading slashes, handle backslashes)
      const entryPath = entry.entryName.replace(/\\/g, "/").replace(/^\/+/, "");

      // Skip hidden/system files
      if (entryPath.startsWith("__MACOSX/") || entryPath.startsWith(".")) continue;
      if (path.basename(entryPath).startsWith(".")) continue;

      // Security: reject path traversal
      if (hasTraversalSegment(entryPath)) continue;

      // Get just the filename (flatten any nested directory structure within the zip)
      const segments = entryPath.split("/").filter(Boolean);
      const entryFileName = segments.at(-1);
      if (!entryFileName) continue;

      const safeEntryName = entryFileName.replace(/[\x00-\x1f<>:"|?*]/g, "_");

      // Build the subpath preserving internal zip folder structure
      const subPath = segments.length > 1
        ? segments.slice(0, -1).map((s) => s.replace(/[\x00-\x1f<>:"|?*]/g, "_")).join("/") + "/" + safeEntryName
        : safeEntryName;

      const fileRelative = `${folderRelative}/${subPath}`;
      const fileTarget = projectPath(projectRoot, fileRelative);

      // Ensure the entry resolves inside the project root
      if (!isPathInsideRoot(projectRoot, fileTarget.absolute)) continue;

      const entryBuffer = entry.getData();
      if (!entryBuffer || entryBuffer.length === 0) continue;

      // Write the file
      await fs.mkdir(path.dirname(fileTarget.absolute), { recursive: true });
      const { absolute, relative } = await resolveProjectFileTarget(projectRoot, fileTarget.relative, { allowMissing: true });
      await fs.writeFile(absolute, entryBuffer);

      const meta = classifyPath(projectRoot, relative);
      const stat = await fs.stat(absolute);
      const fileItem = projectFileItem("inputs_human", relative, meta, stat);

      // Extract PDFs inside the zip too
      if (safeEntryName.toLowerCase().endsWith(".pdf")) {
        await extractPdfCompanion(projectRoot, `${safeFolderName}/${subPath}`, entryBuffer, fileItem);
      }

      extracted.push(fileItem);
    }

    return extracted;
  }

  /**
   * Create a .pdf.md companion file for a PDF, writing either extracted
   * text or a failure explanation.
   */
  async function extractPdfCompanion(projectRoot, relativeName, buffer, fileItem) {
    try {
      const mod = await import("pdf-parse");
      const PDFParse = mod.PDFParse;
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      const content = cleanPdfText(result.text);
      await parser.destroy();

      const mdName = `${relativeName}.md`;
      const mdTarget = projectPath(projectRoot, `inputs_human/${mdName}`);
      const { absolute: mdAbsolute } = await resolveProjectFileTarget(projectRoot, mdTarget.relative, { allowMissing: true });

      const mdHeader = [
        `# ${relativeName.replace(/\\.[^/.]+$/, "").split("/").pop()}`,
        "",
        `- File: inputs_human/${relativeName}`,
        `- Type: PDF Extraction`,
        `- Extracted: ${new Date().toISOString().slice(0, 10)}`,
        "",
        "---",
        "",
        content,
      ].join("\n");

      await fs.mkdir(path.dirname(mdAbsolute), { recursive: true });
      await fs.writeFile(mdAbsolute, mdHeader, "utf8");

      // Mark the PDF itself as previewable since extracted content is available.
      fileItem.previewable = true;
    } catch (error) {
      console.error(`[pdf extraction error] Failed to extract ${relativeName}:`, error);

      const mdName = `${relativeName}.md`;
      const mdTarget = projectPath(projectRoot, `inputs_human/${mdName}`);
      const { absolute: mdAbsolute } = await resolveProjectFileTarget(projectRoot, mdTarget.relative, { allowMissing: true });

      const mdFailureContent = [
        `# PDF Extraction Failed`,
        "",
        `- File: inputs_human/${relativeName}`,
        `- Status: **Extraction Failed**`,
        `- Error: ${error?.message || "Unknown error"}`,
        "",
        "---",
        "",
        "The system was unable to extract text from this PDF file. It may be corrupt, password-protected, or contain only scanned images without OCR text.",
      ].join("\n");

      await fs.mkdir(path.dirname(mdAbsolute), { recursive: true });
      await fs.writeFile(mdAbsolute, mdFailureContent, "utf8");

      // Still mark PDF previewable since we wrote an error explanation .pdf.md.
      fileItem.previewable = true;
    }
  }

  async function createHumanInputTextFile(projectRoot, rawName, content = "", folder = "") {
    const safeName = safeUploadFileName(rawName);
    const fileName = safeName.endsWith(".md") ? safeName : `${safeName}.md`;

    // Validate optional folder target
    const normalizedFolder = folder.replace(/\/+$/, "").trim();
    let relativePath;

    if (normalizedFolder) {
      if (hasTraversalSegment(normalizedFolder)) {
        throw httpError("Path escapes the project root.", 403, "path_escape");
      }

      const folderPath = `inputs_human/${normalizedFolder}`;
      const folderTarget = await resolveProjectDirectory(projectRoot, folderPath, { allowMissing: false });
      const folderStat = await fs.stat(folderTarget.absolute);
      if (!folderStat.isDirectory()) {
        throw httpError(`${folderPath} is not a folder.`, 400, "create_text_target_not_folder");
      }

      relativePath = `${folderPath}/${fileName}`;
    } else {
      relativePath = `inputs_human/${fileName}`;
    }

    const target = projectPath(projectRoot, relativePath);
    await fs.mkdir(path.dirname(target.absolute), { recursive: true });
    const { absolute, relative } = await resolveProjectFileTarget(projectRoot, target.relative, { allowMissing: true });

    if (await fileExists(absolute)) {
      const location = normalizedFolder ? `inputs_human/${normalizedFolder}/` : "inputs_human/";
      throw httpError(`A file named ${fileName} already exists in ${location}.`, 409, "file_already_exists");
    }

    const fileContent = typeof content === "string" ? content : "";
    await fs.writeFile(absolute, fileContent, "utf8");

    const meta = classifyPath(projectRoot, relative);
    const stat = await fs.stat(absolute);
    const file = projectFileItem("inputs_human", relative, meta, stat);
    invalidateSearchCache(projectRoot);
    return { file };
  }

  async function createHumanInputFolder(projectRoot, rawName, folder = "") {
    const safeName = safeUploadFileName(rawName);
    const normalizedFolder = folder.replace(/\/+$/, "").trim();
    let relativePath;

    if (normalizedFolder) {
      if (hasTraversalSegment(normalizedFolder)) {
        throw httpError("Path escapes the project root.", 403, "path_escape");
      }

      const folderPath = `inputs_human/${normalizedFolder}`;
      const folderTarget = await resolveProjectDirectory(projectRoot, folderPath, { allowMissing: false });
      const folderStat = await fs.stat(folderTarget.absolute);
      if (!folderStat.isDirectory()) {
        throw httpError(`${folderPath} is not a folder.`, 400, "create_folder_target_not_folder");
      }

      relativePath = `${folderPath}/${safeName}`;
    } else {
      relativePath = `inputs_human/${safeName}`;
    }

    const target = projectPath(projectRoot, relativePath);
    const { absolute } = await resolveProjectDirectory(projectRoot, target.relative, { allowMissing: true });

    if (await fileExists(absolute)) {
      const location = normalizedFolder ? `inputs_human/${normalizedFolder}/` : "inputs_human/";
      throw httpError(`A folder named ${safeName} already exists in ${location}.`, 409, "folder_already_exists");
    }

    await fs.mkdir(absolute, { recursive: true });
    invalidateSearchCache(projectRoot);
    return { folder: relativePath };
  }

  async function deleteHumanInputFolder(projectRoot, rawFolder) {
    const normalizedFolder = String(rawFolder ?? "").replace(/\/+$/, "").trim();

    if (!normalizedFolder) {
      throw httpError("A folder name is required.", 400, "delete_folder_empty");
    }

    if (hasTraversalSegment(normalizedFolder)) {
      throw httpError("Path escapes the project root.", 403, "path_escape");
    }

    const relativePath = `inputs_human/${normalizedFolder}`;
    const target = await resolveProjectDirectory(projectRoot, relativePath, { allowMissing: false });
    const stat = await fs.stat(target.absolute);

    if (!stat.isDirectory()) {
      throw httpError(`${relativePath} is not a folder.`, 400, "delete_not_folder");
    }

    await fs.rm(target.absolute, { recursive: true, force: true });
    invalidateSearchCache(projectRoot);
    return { folder: relativePath };
  }

  async function pruneEmptyDirectories(rootAbsolute, currentAbsolute) {
    if (currentAbsolute === rootAbsolute || !isPathInsideRoot(rootAbsolute, currentAbsolute)) return;

    const entries = await fs.readdir(currentAbsolute);
    if (entries.length > 0) return;

    await fs.rmdir(currentAbsolute);
    await pruneEmptyDirectories(rootAbsolute, path.dirname(currentAbsolute));
  }

  async function deleteHumanInputFile(projectRoot, relativePath) {
    const meta = classifyPath(projectRoot, relativePath);

    if (!meta.path.startsWith("inputs_human/")) {
      throw httpError("Only human input files can be deleted here.", 403, "delete_not_allowed");
    }

    if (isHiddenProjectPath(meta.path)) {
      throw httpError("Hidden project files cannot be managed in the lab UI.", 403, "hidden_file");
    }

    const { absolute } = await resolveProjectFileTarget(projectRoot, meta.path);
    const stat = await fs.stat(absolute);

    if (!stat.isFile()) {
      throw httpError("Only files can be deleted here.", 400, "delete_not_file");
    }

    await fs.unlink(absolute);

    // Also remove .pdf.md extraction companion if it exists.
    if (meta.path.toLowerCase().endsWith(".pdf")) {
      const companionPath = path.join(projectRoot, `${meta.path}.md`);
      try { await fs.unlink(companionPath); } catch { /* ignore */ }
    }

    invalidateSearchCache(projectRoot);

    return { path: meta.path };
  }

  /** Allowed directory prefixes for general file/folder deletion from the sidebar. */
  const deletableDirectoryPrefixes = ["inputs_human/", "sources/", "inputs_ai/", "outputs_ai/"];

  function isDeletablePath(normalizedPath) {
    return deletableDirectoryPrefixes.some((prefix) => normalizedPath.startsWith(prefix));
  }

  async function deleteProjectFile(projectRoot, relativePath) {
    const meta = classifyPath(projectRoot, relativePath);

    if (!isDeletablePath(meta.path)) {
      throw httpError("This file cannot be deleted from the lab UI.", 403, "delete_not_allowed");
    }

    if (isHiddenProjectPath(meta.path)) {
      throw httpError("Hidden project files cannot be managed in the lab UI.", 403, "hidden_file");
    }

    const { absolute } = await resolveProjectFileTarget(projectRoot, meta.path);
    const stat = await fs.stat(absolute);

    if (!stat.isFile()) {
      throw httpError("Only files can be deleted.", 400, "delete_not_file");
    }

    await fs.unlink(absolute);

    // Also remove .pdf.md extraction companion if it exists.
    if (meta.path.toLowerCase().endsWith(".pdf")) {
      const companionPath = path.join(projectRoot, `${meta.path}.md`);
      try { await fs.unlink(companionPath); } catch { /* ignore */ }
    }

    // Prune parent directories that may now be empty.
    const rootAbsolute = path.join(projectRoot, meta.path.split("/")[0]);
    await pruneEmptyDirectories(rootAbsolute, path.dirname(absolute));

    invalidateSearchCache(projectRoot);
    return { path: meta.path };
  }

  async function deleteProjectFolder(projectRoot, relativePath) {
    const normalized = String(relativePath ?? "").replace(/\/+$/, "").trim();

    if (!normalized) {
      throw httpError("A folder path is required.", 400, "delete_folder_empty");
    }

    if (hasTraversalSegment(normalized)) {
      throw httpError("Path escapes the project root.", 403, "path_escape");
    }

    if (!isDeletablePath(normalized)) {
      throw httpError("This folder cannot be deleted from the lab UI.", 403, "delete_not_allowed");
    }

    const target = await resolveProjectDirectory(projectRoot, normalized, { allowMissing: false });
    const stat = await fs.stat(target.absolute);

    if (!stat.isDirectory()) {
      throw httpError(`${normalized} is not a folder.`, 400, "delete_not_folder");
    }

    await fs.rm(target.absolute, { recursive: true, force: true });

    // Prune parent directories that may now be empty (for nested folders).
    const rootAbsolute = path.join(projectRoot, normalized.split("/")[0]);
    await pruneEmptyDirectories(rootAbsolute, path.dirname(target.absolute));

    invalidateSearchCache(projectRoot);
    return { folder: normalized };
  }

  async function moveHumanInputFile(projectRoot, sourcePath, targetFolder) {
    const sourceMeta = classifyPath(projectRoot, sourcePath);

    if (!sourceMeta.path.startsWith("inputs_human/")) {
      throw httpError("Only human input files can be moved here.", 403, "move_not_allowed");
    }

    if (isHiddenProjectPath(sourceMeta.path)) {
      throw httpError("Hidden project files cannot be managed in the lab UI.", 403, "hidden_file");
    }

    const sourceTarget = await resolveProjectFileTarget(projectRoot, sourceMeta.path);
    const sourceStat = await fs.stat(sourceTarget.absolute);

    if (!sourceStat.isFile()) {
      throw httpError("Only files can be moved.", 400, "move_not_file");
    }

    // Validate targetFolder: must be empty string (root) or a single segment (1-level subfolder)
    const normalizedFolder = targetFolder.replace(/\/+$/, "").trim();
    let destRelative;

    if (!normalizedFolder) {
      // Move to inputs_human root
      destRelative = `inputs_human/${path.basename(sourceTarget.absolute)}`;
    } else {
      if (hasTraversalSegment(normalizedFolder)) {
        throw httpError("Path escapes the project root.", 403, "path_escape");
      }

      const folderPath = `inputs_human/${normalizedFolder}`;
      const folderTarget = await resolveProjectDirectory(projectRoot, folderPath, { allowMissing: false });
      const folderStat = await fs.stat(folderTarget.absolute);
      if (!folderStat.isDirectory()) {
        throw httpError(`${folderPath} is not a folder.`, 400, "move_target_not_folder");
      }

      destRelative = `${folderPath}/${path.basename(sourceTarget.absolute)}`;
    }

    if (destRelative === sourceMeta.path) {
      throw httpError("File is already in that location.", 409, "move_same_location");
    }

    const destTarget = projectPath(projectRoot, destRelative);
    const { absolute: destAbsolute, relative: destFinal } = await resolveProjectFileTarget(projectRoot, destTarget.relative, { allowMissing: true });

    if (await fileExists(destAbsolute)) {
      throw httpError(`A file named ${path.basename(destAbsolute)} already exists in that folder.`, 409, "move_file_exists");
    }

    await fs.rename(sourceTarget.absolute, destAbsolute);

    // Prune empty directories left behind
    const inputRoot = projectPath(projectRoot, "inputs_human");
    await pruneEmptyDirectories(inputRoot.absolute, path.dirname(sourceTarget.absolute));

    const meta = classifyPath(projectRoot, destFinal);
    const stat = await fs.stat(destAbsolute);
    const file = projectFileItem("inputs_human", destFinal, meta, stat);
    invalidateSearchCache(projectRoot);

    return { oldPath: sourceMeta.path, newPath: meta.path, file };
  }

  async function readSearchAllowedPaths() {
    const allowlistPath = path.join(WEB_ROOT, "server/search-allowed-paths.json");
    const stat = await fs.stat(allowlistPath).catch(() => null);
    if (searchAllowlistCache && searchAllowlistCache.mtimeMs === stat?.mtimeMs) {
      return searchAllowlistCache.value;
    }

    let lookup = {};

    try {
      lookup = JSON.parse(await fs.readFile(allowlistPath, "utf8"));
    } catch {
      lookup = {};
    }

    const value = {
      directories: Array.isArray(lookup.directories) ? lookup.directories.map(String) : [],
      files: Array.isArray(lookup.files) ? lookup.files.map(String) : [],
    };
    searchAllowlistCache = { mtimeMs: stat?.mtimeMs, value };
    return value;
  }

  function fileMatchesPattern(fileName, pattern) {
    if (pattern === "human_*.md") {
      return /^human_[^/]+\.md$/i.test(fileName);
    }

    return fileName === pattern;
  }

  async function listSearchDirectoryFiles(projectRoot, rootRelative) {
    const root = await resolveProjectDirectory(projectRoot, rootRelative.replace(/\/+$/, ""), { allowMissing: true });
    const files = [];

    async function walk(currentAbsolute) {
      const entries = await fs.readdir(currentAbsolute, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

        const absolute = path.join(currentAbsolute, entry.name);
        const relative = path.relative(projectRoot, absolute).replaceAll(path.sep, "/");
        await rejectSymlinkEntry(absolute);
        if (isHiddenProjectPath(relative)) continue;

        if (entry.isDirectory()) {
          await walk(absolute);
          continue;
        }

        if (!entry.name.endsWith(".md")) continue;

        const meta = classifyPath(projectRoot, relative);
        const stat = await fs.stat(absolute);
        files.push({
          path: meta.path,
          name: relative.replace(`${root.relative}/`, ""),
          kind: meta.kind,
          editable: meta.editable,
          annotation: meta.annotation,
          chatContextReadable: isChatContextReadablePath(meta.path),
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }

    try {
      await walk(root.absolute);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    return files;
  }

  async function listSearchPatternFiles(projectRoot, pattern) {
    const root = projectPath(projectRoot, ".");
    const entries = await fs.readdir(root.absolute, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      await rejectSymlinkEntry(path.join(root.absolute, entry.name));
      if (!entry.isFile() || !fileMatchesPattern(entry.name, pattern)) continue;

      const meta = classifyPath(projectRoot, entry.name);
      const stat = await fs.stat(path.join(root.absolute, entry.name));
      files.push({
        path: meta.path,
        name: meta.path,
        kind: meta.kind,
        editable: meta.editable,
        annotation: meta.annotation,
        chatContextReadable: isChatContextReadablePath(meta.path),
        modifiedAt: stat.mtime.toISOString(),
      });
    }

    return files;
  }

  function searchableText(file) {
    return [
      file.path,
      file.name,
      ...file.path.split("/").map(humanizePathSegment),
      humanizePathSegment(file.name.split("/").at(-1) ?? file.name),
    ]
      .join(" ")
      .toLowerCase();
  }

  function invalidateSearchCache(projectRoot = null) {
    if (projectRoot) {
      searchCandidateCache.delete(projectRoot);
      return;
    }
    searchCandidateCache.clear();
  }

  async function searchCandidates(projectRoot) {
    const cached = searchCandidateCache.get(projectRoot);
    if (cached && Date.now() - cached.createdAt < searchCacheTtlMs) return cached.candidates;

    const allowlist = await readSearchAllowedPaths();
    const candidates = [
      ...(await Promise.all(allowlist.directories.map((directory) => listSearchDirectoryFiles(projectRoot, directory)))).flat(),
      ...(await Promise.all(allowlist.files.map((pattern) => listSearchPatternFiles(projectRoot, pattern)))).flat(),
    ];
    const uniqueCandidates = [...new Map(candidates.map((file) => [file.path, file])).values()].map((file) => ({
      ...file,
      searchableText: searchableText(file),
    }));

    searchCandidateCache.set(projectRoot, { createdAt: Date.now(), candidates: uniqueCandidates });
    return uniqueCandidates;
  }

  async function gitGrepSearch(projectRoot, tokens) {
    if (tokens.length === 0) return new Map();

    const args = ["grep", "-i", "-I", "-n", "--untracked", "--all-match"];
    for (const token of tokens) {
      args.push("-F", "-e", token);
    }

    return new Promise((resolve) => {
      execFile("git", args, { cwd: projectRoot, maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
        if (error) {
          // Exit code 1 means no lines were selected.
          resolve(new Map());
          return;
        }

        const map = new Map();
        for (const line of stdout.split("\n")) {
          if (!line) continue;
          const match = line.match(/^([^:]+):(\d+):(.*)$/);
          if (!match) continue;
          
          const path = match[1];
          if (!map.has(path)) {
            let content = match[3].trim();
            const lowerContent = content.toLowerCase();
            let matchIndex = -1;
            for (const token of tokens) {
              const idx = lowerContent.indexOf(token);
              if (idx !== -1) {
                matchIndex = idx;
                break;
              }
            }
            if (matchIndex !== -1) {
              const start = Math.max(0, matchIndex - 40);
              const end = Math.min(content.length, matchIndex + 40);
              content = (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "");
            } else {
              content = content.slice(0, 80) + (content.length > 80 ? "..." : "");
            }
            map.set(path, content);
          }
        }
        resolve(map);
      });
    });
  }

  async function searchFiles(projectRoot, query, filter) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery && (!filter || filter === "all")) return [];

    const tokens = normalizedQuery ? normalizedQuery.split(/\s+/) : [];

    let candidates = await searchCandidates(projectRoot);

    if (filter && filter !== "all") {
      candidates = candidates.filter((file) => {
        if (filter === "sources") {
          return file.path.startsWith("sources/");
        }
        if (filter === "wiki") {
          return file.path.startsWith("outputs_ai/wiki/");
        }
        if (filter === "outputs") {
          return file.path.startsWith("artifacts/") || (file.path.startsWith("outputs_ai/") && !file.path.startsWith("outputs_ai/wiki/"));
        }
        return true;
      });
    }

    if (tokens.length > 0) {
      const fullTextMap = await gitGrepSearch(projectRoot, tokens);

      candidates = candidates.filter((file) => {
        const matchesPath = tokens.every((token) => file.searchableText.includes(token));
        const snippet = fullTextMap.get(file.path);
        
        if (matchesPath) {
          file.snippet = snippet;
          return true;
        }
        
        if (snippet) {
          file.snippet = snippet;
          return true;
        }
        return false;
      });
    }

    return candidates
      .map(({ searchableText: _searchableText, ...file }) => file)
      .sort((left, right) => left.path.localeCompare(right.path))
      .slice(0, MAX_SEARCH_RESULTS);
  }

  async function gitStatus(projectRoot) {
    return new Promise((resolve) => {
      execFile("git", ["status", "--short"], { cwd: projectRoot }, (error, stdout) => {
        if (error) {
          resolve([`git status unavailable: ${error.message}`]);
          return;
        }

        resolve(stdout.split("\n").filter(Boolean));
      });
    });
  }

  function parseGitDiff(relativePath, diffText) {
    const ranges = [];
    const deletions = [];
    const hunkPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
    let match;

    while ((match = hunkPattern.exec(diffText)) !== null) {
      const oldStart = Number(match[1]);
      const oldCount = Number(match[2] ?? "1");
      const newStart = Number(match[3]);
      const newCount = Number(match[4] ?? "1");

      if (newCount > 0) {
        ranges.push({ from: newStart, to: newStart + newCount - 1 });
      }

      if (oldCount > 0 && newCount === 0) {
        deletions.push({ afterLine: Math.max(0, newStart), count: oldCount });
      }

      if (oldCount > newCount && newCount > 0) {
        deletions.push({ afterLine: newStart + newCount - 1, count: oldCount - newCount });
      }
    }

    return { path: relativePath, ranges, deletions };
  }

  async function gitFileDiff(projectRoot, relativePath) {
    const meta = classifyPath(projectRoot, relativePath);
    await resolveProjectFileTarget(projectRoot, meta.path);

    return new Promise((resolve) => {
      execFile("git", ["diff", "--unified=0", "--", meta.path], { cwd: projectRoot }, (error, stdout) => {
        if (error) {
          resolve({ path: meta.path, ranges: [], deletions: [] });
          return;
        }

        resolve(parseGitDiff(meta.path, stdout));
      });
    });
  }

  async function gitFileDiffText(projectRoot, relativePath) {
    const meta = classifyPath(projectRoot, relativePath);
    await resolveProjectFileTarget(projectRoot, meta.path);

    return new Promise((resolve) => {
      execFile("git", ["diff", "--", meta.path], { cwd: projectRoot }, (error, stdout) => {
        if (error) {
          resolve({ diff: "", diffError: `git diff unavailable for ${meta.path}: ${error.message}` });
          return;
        }

        resolve({ diff: String(stdout ?? ""), diffError: "" });
      });
    });
  }

  async function gitFileDiffTexts(projectRoot, relativePaths) {
    const metas = [];
    for (const relativePath of [...new Set(relativePaths)]) {
      const meta = classifyPath(projectRoot, relativePath);
      await resolveProjectFileTarget(projectRoot, meta.path);
      metas.push(meta);
    }

    if (!metas.length) return [];

    const diffText = await new Promise((resolve) => {
      execFile("git", ["diff", "--", ...metas.map((meta) => meta.path)], { cwd: projectRoot }, (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }

        resolve(String(stdout ?? ""));
      });
    });

    if (diffText === null) {
      return await Promise.all(metas.map((meta) => gitFileDiffText(projectRoot, meta.path).then((result) => ({ path: meta.path, ...result }))));
    }

    const starts = metas
      .map((meta) => ({ path: meta.path, index: diffText.indexOf(`diff --git a/${meta.path} b/${meta.path}`) }))
      .filter((entry) => entry.index >= 0)
      .sort((left, right) => left.index - right.index);
    const diffByPath = new Map(
      starts.map((entry, index) => {
        const next = starts[index + 1]?.index ?? diffText.length;
        return [entry.path, diffText.slice(entry.index, next)];
      }),
    );

    return await Promise.all(
      metas.map(async (meta) => {
        const diff = diffByPath.get(meta.path);
        if (diff !== undefined) return { path: meta.path, diff, diffError: "" };
        if (!diffText.includes(`/${meta.path}`)) return { path: meta.path, diff: "", diffError: "" };
        return { path: meta.path, ...(await gitFileDiffText(projectRoot, meta.path)) };
      }),
    );
  }

  async function restoreFileFromHead(projectRoot, relativePath) {
    const meta = classifyPath(projectRoot, relativePath);

    if (!meta.editable && !meta.annotation) {
      throw httpError("This file is read-only in the lab UI.", 403, "file_read_only");
    }

    if (meta.previewable === false) {
      throw httpError("This file type is saved in the project but cannot be restored in the lab UI.", 415, "file_not_previewable");
    }

    await resolveProjectFileTarget(projectRoot, meta.path);

    await new Promise((resolve, reject) => {
      execFile("git", ["restore", "--source=HEAD", "--staged", "--worktree", "--", meta.path], { cwd: projectRoot }, (error) => {
        if (error) {
          reject(httpError("Could not restore this file from Git HEAD.", 500, "git_restore_failed"));
          return;
        }

        resolve(null);
      });
    });

    invalidateSearchCache(projectRoot);
    return readTextFile(projectRoot, meta.path);
  }

  const renameableOutputPrefixes = ["outputs_ai/reports/", "outputs_ai/artifacts/"];

  function isRenameablePath(relativePath) {
    return renameableOutputPrefixes.some((prefix) => relativePath.startsWith(prefix));
  }

  async function renameOutputFile(projectRoot, fromPath, toPath) {
    const normalizedFrom = projectPath(projectRoot, fromPath).relative;
    const normalizedTo = projectPath(projectRoot, toPath).relative;

    if (!isRenameablePath(normalizedFrom)) {
      throw httpError(`Source path must be under ${renameableOutputPrefixes.join(" or ")}.`, 403, "rename_source_not_allowed");
    }

    if (!isRenameablePath(normalizedTo)) {
      throw httpError(`Target path must be under ${renameableOutputPrefixes.join(" or ")}.`, 403, "rename_target_not_allowed");
    }

    if (normalizedFrom === normalizedTo) {
      throw httpError("Source and target paths are the same.", 409, "rename_same_path");
    }

    if (isHiddenProjectPath(normalizedFrom) || isHiddenProjectPath(normalizedTo)) {
      throw httpError("Hidden project files cannot be managed in the lab UI.", 403, "hidden_file");
    }

    // Delegate to renameOutput which handles disk rename + all 6 data store updates
    const result = await renameOutput(projectRoot, normalizedFrom, normalizedTo);

    // Prune empty source directories left behind
    const outputsRoot = projectPath(projectRoot, "outputs_ai");
    const sourceAbsolute = path.join(projectRoot, normalizedFrom);
    await pruneEmptyDirectories(outputsRoot.absolute, path.dirname(sourceAbsolute));

    invalidateSearchCache(projectRoot);
    return { oldPath: normalizedFrom, newPath: normalizedTo, ...result };
  }

  async function browseLocalDirs(startPath) {
    let target = startPath ? String(startPath) : process.env.HOME || "/";
    target = path.resolve(target);

    try {
      const entries = await fs.readdir(target, { withFileTypes: true });
      const directories = [];
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          directories.push({
            name: entry.name,
            path: path.join(target, entry.name),
          });
        }
      }
      directories.sort((a, b) => a.name.localeCompare(b.name));
      return {
        currentPath: target,
        parentPath: path.dirname(target),
        directories,
      };
    } catch (err) {
      throw httpError(`Cannot read directory "${target}": ${err.message}`, 400, "directory_inaccessible");
    }
  }

  async function uploadExternalRepoZip(projectRoot, name, buffer) {
    const targetDir = path.join(projectRoot, ".kiss_ai", "repos", name);

    // Clean/recreate target directory
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(targetDir, { recursive: true });

    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(buffer);
    zip.extractAllTo(targetDir, true);

    // Save to external_repos.json
    let currentRepos = [];
    const jsonFilePath = path.join(projectRoot, ".kiss_ai", "external_repos.json");
    try {
      const jsonContent = await fs.readFile(jsonFilePath, "utf8");
      currentRepos = JSON.parse(jsonContent);
    } catch (err) {
      // file doesn't exist yet, start empty
    }

    if (!Array.isArray(currentRepos)) {
      if (currentRepos && typeof currentRepos === "object") {
        currentRepos = Object.entries(currentRepos).map(([n, p]) => ({ name: n, path: p }));
      } else {
        currentRepos = [];
      }
    }

    const relativePath = path.join(".kiss_ai", "repos", name);
    const existingIdx = currentRepos.findIndex((r) => r.name.toLowerCase() === name.toLowerCase());
    if (existingIdx >= 0) {
      currentRepos[existingIdx].path = relativePath;
    } else {
      currentRepos.push({ name, path: relativePath });
    }

    await fs.mkdir(path.dirname(jsonFilePath), { recursive: true });
    await fs.writeFile(jsonFilePath, JSON.stringify(currentRepos, null, 2), "utf8");

    return { name, path: relativePath };
  }

  return {
    browseLocalDirs,
    classifyPath,
    createHumanInputFolder,
    createHumanInputTextFile,
    deleteHumanInputFile,
    deleteHumanInputFolder,
    deleteProjectFile,
    deleteProjectFolder,
    fileExists,
    moveHumanInputFile,
    gitFileDiff,
    gitFileDiffText,
    gitFileDiffTexts,
    gitStatus,
    isPathInsideRoot,
    listMarkdownFiles,
    listProjectFiles,
    projectPath,
    readProjectJson,
    readTextFile,
    renameOutputFile,
    restoreFileFromHead,
    searchFiles,
    uploadHumanInputFiles,
    writeProjectJson,
    writeTextFile,
    uploadExternalRepoZip,
  };
}

