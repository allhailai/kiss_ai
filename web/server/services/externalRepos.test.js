import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseExternalRepos, getGitCommitHash, getCurrentRepoHashes } from "./externalRepos.js";

describe("externalRepos", () => {
  describe("parseExternalRepos", () => {
    it("should parse JSON config file in array of objects format", async () => {
      const mockJson = [
        { "name": "repo1", "path": "/Users/test/projects/repo1" },
        { "name": "repo2", "path": "../repo2" }
      ];
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (String(filePath).endsWith("external_repos.json")) {
          return JSON.stringify(mockJson);
        }
        throw new Error("ENOENT");
      });

      const repos = await parseExternalRepos("/mock/project/path");

      expect(repos).toEqual([
        { name: "repo1", path: "/Users/test/projects/repo1" },
        { name: "repo2", path: "/mock/project/repo2" },
      ]);

      vi.restoreAllMocks();
    });

    it("should parse JSON config file in key-value map format", async () => {
      const mockJson = {
        "repo1": "/Users/test/projects/repo1",
        "repo2": "../repo2"
      };
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (String(filePath).endsWith("external_repos.json")) {
          return JSON.stringify(mockJson);
        }
        throw new Error("ENOENT");
      });

      const repos = await parseExternalRepos("/mock/project/path");

      expect(repos).toEqual([
        { name: "repo1", path: "/Users/test/projects/repo1" },
        { name: "repo2", path: "/mock/project/repo2" },
      ]);

      vi.restoreAllMocks();
    });

    it("should fall back to project.md parsing if JSON config is missing or invalid", async () => {
      const mockProjectMd = `
# Project: Test Project

## External Repositories
- [repo1](file:///Users/test/projects/repo1)
- [repo2](/Users/test/projects/repo2)
- repo3: file:///Users/test/projects/repo3
- repo4: /Users/test/projects/repo4

## Goal
Do something.
`;
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (String(filePath).endsWith("external_repos.json")) {
          throw new Error("ENOENT");
        }
        if (String(filePath).endsWith("project.md")) {
          return mockProjectMd;
        }
        throw new Error("ENOENT");
      });

      const repos = await parseExternalRepos("/mock/project/path");

      expect(repos).toEqual([
        { name: "repo1", path: "/Users/test/projects/repo1" },
        { name: "repo2", path: "/Users/test/projects/repo2" },
        { name: "repo3", path: "/Users/test/projects/repo3" },
        { name: "repo4", path: "/Users/test/projects/repo4" },
      ]);

      vi.restoreAllMocks();
    });

    it("should return empty list if external repositories section is missing in project.md fallback", async () => {
      const mockProjectMd = `
# Project: Test Project

## Goal
Do something.
`;
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (String(filePath).endsWith("external_repos.json")) {
          throw new Error("ENOENT");
        }
        if (String(filePath).endsWith("project.md")) {
          return mockProjectMd;
        }
        throw new Error("ENOENT");
      });

      const repos = await parseExternalRepos("/mock/project/path");
      expect(repos).toEqual([]);

      vi.restoreAllMocks();
    });
  });
});
