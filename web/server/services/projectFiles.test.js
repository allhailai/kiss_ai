import { describe, expect, it, vi } from "vitest";

vi.mock("pdf-parse", () => {
  return {
    PDFParse: class {
      constructor() {}
      async getText() {
        return { text: "PDF Content Here\nALL CAPS HEADING" };
      }
      async destroy() {}
    }
  };
});
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProjectFileService } from "./projectFiles.js";
import { httpError } from "./httpErrors.js";

function createService(webRoot) {
  return createProjectFileService({
    WEB_ROOT: webRoot,
    MAX_FILE_BYTES: 1024 * 1024,
    MAX_UPLOAD_BYTES: 1024 * 1024,
    MAX_SEARCH_RESULTS: 10,
    humanFiles: new Map([["human_goal_requirements.md", { kind: "human", editable: true, annotation: false }]]),
    hashText: (value) => `hash:${String(value).length}`,
    humanizePathSegment: (value) => value,
    httpError,
  });
}

describe("projectFiles path safety", () => {
  it("rejects traversal-like relative paths instead of normalizing them", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const service = createService(projectRoot);

    expect(() => service.projectPath(projectRoot, "../human_goal_requirements.md")).toThrow("Path escapes the project root.");
    expect(() => service.projectPath(projectRoot, "inputs_human/../human_goal_requirements.md")).toThrow("Path escapes the project root.");
  });

  it("allows and reads allowlisted project files", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const service = createService(projectRoot);
    await fs.writeFile(path.join(projectRoot, "human_goal_requirements.md"), "Goal\n", "utf8");

    await expect(service.readTextFile(projectRoot, "human_goal_requirements.md")).resolves.toMatchObject({
      path: "human_goal_requirements.md",
      content: "Goal\n",
      editable: true,
    });
  });

  it("rejects stale writes when the expected content hash no longer matches", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const service = createService(projectRoot);
    await fs.writeFile(path.join(projectRoot, "human_goal_requirements.md"), "Goal\n", "utf8");
    const loaded = await service.readTextFile(projectRoot, "human_goal_requirements.md");

    await fs.writeFile(path.join(projectRoot, "human_goal_requirements.md"), "Changed elsewhere\n", "utf8");

    await expect(
      service.writeTextFile(projectRoot, "human_goal_requirements.md", "My edit\n", { expectedContentHash: loaded.contentHash }),
    ).rejects.toMatchObject({
      code: "file_changed",
      statusCode: 409,
    });
    await expect(fs.readFile(path.join(projectRoot, "human_goal_requirements.md"), "utf8")).resolves.toBe("Changed elsewhere\n");
  });

  it("requires the loaded content hash when writing a file", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const service = createService(projectRoot);
    await fs.writeFile(path.join(projectRoot, "human_goal_requirements.md"), "Goal\n", "utf8");

    await expect(service.writeTextFile(projectRoot, "human_goal_requirements.md", "Updated goal\n")).rejects.toMatchObject({
      code: "file_hash_required",
      statusCode: 428,
    });
    await expect(fs.readFile(path.join(projectRoot, "human_goal_requirements.md"), "utf8")).resolves.toBe("Goal\n");
  });

  it("allows writes when the expected content hash matches", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const service = createService(projectRoot);
    await fs.writeFile(path.join(projectRoot, "human_goal_requirements.md"), "Goal\n", "utf8");
    const loaded = await service.readTextFile(projectRoot, "human_goal_requirements.md");

    await expect(
      service.writeTextFile(projectRoot, "human_goal_requirements.md", "Updated goal\n", { expectedContentHash: loaded.contentHash }),
    ).resolves.toMatchObject({
      content: "Updated goal\n",
      contentHash: "hash:13",
    });
  });

  it("rejects symlinked allowlisted files before reading or writing them", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-outside-"));
    const outsideFile = path.join(outsideRoot, "outside.md");
    const service = createService(projectRoot);

    await fs.writeFile(outsideFile, "outside\n", "utf8");
    await fs.symlink(outsideFile, path.join(projectRoot, "human_goal_requirements.md"));

    await expect(service.readTextFile(projectRoot, "human_goal_requirements.md")).rejects.toMatchObject({
      code: "path_symlink",
    });
    await expect(service.writeTextFile(projectRoot, "human_goal_requirements.md", "changed\n")).rejects.toMatchObject({
      code: "path_symlink",
    });
  });

  it("rejects symlinked project directories before walking them", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-outside-"));
    const service = createService(projectRoot);

    await fs.writeFile(path.join(outsideRoot, "source.md"), "outside\n", "utf8");
    await fs.symlink(outsideRoot, path.join(projectRoot, "inputs_human"));

    await expect(service.listProjectFiles(projectRoot, "inputs_human")).rejects.toMatchObject({
      code: "path_symlink",
    });
  });

  it("rejects nested symlinked files during listing and search", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const webRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-web-"));
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-outside-"));
    await fs.mkdir(path.join(webRoot, "server"));
    await fs.writeFile(path.join(webRoot, "server", "search-allowed-paths.json"), JSON.stringify({ directories: ["inputs_human/"], files: [] }), "utf8");
    await fs.mkdir(path.join(projectRoot, "inputs_human"));
    await fs.writeFile(path.join(outsideRoot, "source.md"), "outside\n", "utf8");
    await fs.symlink(path.join(outsideRoot, "source.md"), path.join(projectRoot, "inputs_human", "source.md"));
    const service = createService(webRoot);

    await expect(service.listProjectFiles(projectRoot, "inputs_human")).rejects.toMatchObject({
      code: "path_symlink",
    });
    await expect(service.searchFiles(projectRoot, "source")).rejects.toMatchObject({
      code: "path_symlink",
    });
  });

  it("rejects uploads that would overwrite a symlinked target", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-outside-"));
    const outsideFile = path.join(outsideRoot, "source.md");
    const service = createService(projectRoot);

    await fs.mkdir(path.join(projectRoot, "inputs_human"));
    await fs.writeFile(outsideFile, "outside\n", "utf8");
    await fs.symlink(outsideFile, path.join(projectRoot, "inputs_human", "source.md"));

    await expect(
      service.uploadHumanInputFiles(projectRoot, [
        {
          name: "source.md",
          contentBase64: Buffer.from("Source material\n", "utf8").toString("base64"),
        },
      ]),
    ).rejects.toMatchObject({
      code: "path_symlink",
    });
  });

  it("surfaces corrupt project JSON instead of returning fallback data", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const service = createService(projectRoot);
    await fs.writeFile(path.join(projectRoot, ".harness-state.json"), "{broken", "utf8");

    await expect(service.readProjectJson(projectRoot, ".harness-state.json", {})).rejects.toMatchObject({
      code: "corrupt_project_json",
    });
  });

  it("sets file capabilities and supports upload, search, and delete for human inputs", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const webRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-web-"));
    await fs.mkdir(path.join(webRoot, "server"));
    await fs.writeFile(
      path.join(webRoot, "server", "search-allowed-paths.json"),
      JSON.stringify({ directories: ["inputs_human/"], files: ["human_*.md"] }),
      "utf8",
    );
    const service = createService(webRoot);

    const upload = await service.uploadHumanInputFiles(projectRoot, [
      {
        name: "source.md",
        contentBase64: Buffer.from("Source material\n", "utf8").toString("base64"),
      },
      {
        name: "reference.pdf",
        contentBase64: Buffer.from("%PDF", "utf8").toString("base64"),
      },
    ]);

    expect(upload.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "inputs_human/source.md", chatContextReadable: true, previewable: true }),
        expect.objectContaining({ path: "inputs_human/reference.pdf", previewable: true }),
      ]),
    );
    // .pdf.md extraction companion should NOT appear in the response
    expect(upload.files.find(f => f.path.endsWith(".pdf.md"))).toBeUndefined();
    await expect(service.searchFiles(projectRoot, "source")).resolves.toEqual([
      expect.objectContaining({ path: "inputs_human/source.md", chatContextReadable: true }),
    ]);
    await expect(service.deleteHumanInputFile(projectRoot, "inputs_human/source.md")).resolves.toEqual({ path: "inputs_human/source.md" });
    await expect(fs.access(path.join(projectRoot, "inputs_human", "source.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("extracts PDF text to markdown on upload", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const webRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-web-"));
    const service = createService(webRoot);

    const upload = await service.uploadHumanInputFiles(projectRoot, [
      {
        name: "test.pdf",
        contentBase64: Buffer.from("dummy pdf content", "utf8").toString("base64"),
      },
    ]);

    // Only the .pdf file should appear in the response — .pdf.md is hidden
    expect(upload.files).toHaveLength(1);
    expect(upload.files[0]).toEqual(
      expect.objectContaining({ path: "inputs_human/test.pdf", previewable: true }),
    );
    expect(upload.files.find(f => f.path.endsWith(".pdf.md"))).toBeUndefined();

    // Reading the PDF path should serve the extracted markdown content
    const pdfRead = await service.readTextFile(projectRoot, "inputs_human/test.pdf");
    expect(pdfRead.content).toContain("# test");
    expect(pdfRead.content).toContain("- Type: PDF Extraction");
    expect(pdfRead.content).toContain("## All Caps Heading");
  });
});
