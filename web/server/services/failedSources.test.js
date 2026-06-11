import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFailedSources, writeFailedSources, addFailedSources, deleteFailedSource } from "./failedSources.js";

describe("failedSources service", () => {
  async function makeTempDir() {
    return await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-failed-sources-"));
  }

  describe("readFailedSources", () => {
    it("returns empty array when file does not exist", async () => {
      const dir = await makeTempDir();
      const result = await readFailedSources(dir);
      expect(result).toEqual([]);
      await fs.rm(dir, { recursive: true, force: true });
    });

    it("reads a valid failed sources file", async () => {
      const dir = await makeTempDir();
      const failedSources = [{ id: "fs-1", url: "https://example.com", error: "403 Blocked", failedAt: "2026-06-10" }];
      await fs.mkdir(path.join(dir, ".build"), { recursive: true });
      await fs.writeFile(
        path.join(dir, ".build/failed_sources.json"),
        JSON.stringify({ failedSources }),
        "utf-8"
      );

      const result = await readFailedSources(dir);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("fs-1");
      expect(result[0].url).toBe("https://example.com");

      await fs.rm(dir, { recursive: true, force: true });
    });
  });

  describe("addFailedSources", () => {
    it("appends new failed sources and handles duplicates", async () => {
      const dir = await makeTempDir();
      
      // Add first time
      await addFailedSources(dir, [
        { url: "https://example.com/failed-1", error: "500 Error" },
        { url: "https://example.com/failed-2", error: "403 Forbidden" },
      ]);

      let list = await readFailedSources(dir);
      expect(list).toHaveLength(2);
      expect(list.map(s => s.url)).toContain("https://example.com/failed-1");
      expect(list.map(s => s.url)).toContain("https://example.com/failed-2");

      // Add duplicate URL with different error
      await addFailedSources(dir, [
        { url: "https://example.com/failed-1", error: "408 Timeout" },
      ]);

      list = await readFailedSources(dir);
      expect(list).toHaveLength(2); // Still 2 entries
      const updatedEntry = list.find(s => s.url === "https://example.com/failed-1");
      expect(updatedEntry?.error).toBe("408 Timeout");

      await fs.rm(dir, { recursive: true, force: true });
    });
  });

  describe("deleteFailedSource", () => {
    it("deletes a failed source by ID and returns true", async () => {
      const dir = await makeTempDir();
      const failedSources = [
        { id: "fs-1", url: "https://example.com/1", error: "Error" },
        { id: "fs-2", url: "https://example.com/2", error: "Error" },
      ];
      await writeFailedSources(dir, failedSources);

      const success = await deleteFailedSource(dir, "fs-1");
      expect(success).toBe(true);

      const list = await readFailedSources(dir);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("fs-2");

      await fs.rm(dir, { recursive: true, force: true });
    });

    it("returns false if ID is not found", async () => {
      const dir = await makeTempDir();
      const failedSources = [{ id: "fs-1", url: "https://example.com", error: "Error" }];
      await writeFailedSources(dir, failedSources);

      const success = await deleteFailedSource(dir, "nonexistent");
      expect(success).toBe(false);

      const list = await readFailedSources(dir);
      expect(list).toHaveLength(1);

      await fs.rm(dir, { recursive: true, force: true });
    });
  });
});
