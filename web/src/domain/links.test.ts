import { describe, expect, it } from "vitest";
import type { ProjectFile } from "../contracts/api";
import {
  createLinkResolutionIndex,
  linkResolutionClass,
  linkResolutionTitle,
  resolveMarkdownLinkWithIndex,
  resolveWikiLinkWithIndex,
  wikiLinkLabel,
} from "./links";

function makeFile(path: string, overrides?: Partial<ProjectFile>): ProjectFile {
  return {
    path,
    name: path,
    kind: "ai",
    editable: false,
    annotation: false,
    ...overrides,
  };
}

function makeIndex(files: ProjectFile[], selectedPath: string | null = null) {
  return createLinkResolutionIndex(files, selectedPath);
}

describe("wikiLinkLabel", () => {
  it("returns the filename without .md", () => {
    expect(wikiLinkLabel("some_page")).toBe("some_page");
  });

  it("strips directory prefixes", () => {
    expect(wikiLinkLabel("wiki/economics/overview")).toBe("overview");
  });

  it("uses alias if present", () => {
    expect(wikiLinkLabel("page|My Alias")).toBe("My Alias");
  });

  it("strips heading anchors", () => {
    expect(wikiLinkLabel("page#section")).toBe("page");
  });
});

describe("createLinkResolutionIndex", () => {
  it("creates a searchable index from files", () => {
    const index = makeIndex([makeFile("outputs_ai/wiki/economics.md")]);
    expect(index.exact.has("outputs_ai/wiki/economics.md")).toBe(true);
    expect(index.basename.has("economics.md")).toBe(true);
    expect(index.basenameStem.has("economics")).toBe(true);
  });

  it("tracks the selected directory", () => {
    const index = makeIndex([], "outputs_ai/wiki/test.md");
    expect(index.selectedDirectory).toBe("outputs_ai/wiki");
  });

  it("sets empty selected directory for root files", () => {
    const index = makeIndex([], "project.md");
    expect(index.selectedDirectory).toBe("");
  });
});

describe("resolveWikiLinkWithIndex", () => {
  it("resolves an exact path match", () => {
    const index = makeIndex([makeFile("outputs_ai/wiki/economics.md")]);
    const result = resolveWikiLinkWithIndex("outputs_ai/wiki/economics", index);
    expect(result.status).toBe("resolved");
  });

  it("resolves by basename stem", () => {
    const index = makeIndex([makeFile("outputs_ai/wiki/economics.md")]);
    const result = resolveWikiLinkWithIndex("economics", index);
    expect(result.status).toBe("resolved");
  });

  it("returns missing for unknown target", () => {
    const index = makeIndex([makeFile("outputs_ai/wiki/economics.md")]);
    const result = resolveWikiLinkWithIndex("nonexistent", index);
    expect(result.status).toBe("missing");
  });

  it("returns missing for empty target", () => {
    const index = makeIndex([]);
    const result = resolveWikiLinkWithIndex("", index);
    expect(result.status).toBe("missing");
  });

  it("handles alias syntax", () => {
    const index = makeIndex([makeFile("outputs_ai/wiki/overview.md")]);
    const result = resolveWikiLinkWithIndex("overview|Summary", index);
    expect(result.status).toBe("resolved");
  });

  it("returns ambiguous for multiple matches", () => {
    const index = makeIndex([
      makeFile("dir_a/overview.md"),
      makeFile("dir_b/overview.md"),
    ]);
    const result = resolveWikiLinkWithIndex("overview", index);
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.matches).toHaveLength(2);
    }
  });
});

describe("resolveMarkdownLinkWithIndex", () => {
  it("resolves a relative path", () => {
    const index = makeIndex([makeFile("outputs_ai/wiki/economics.md")]);
    const result = resolveMarkdownLinkWithIndex("outputs_ai/wiki/economics.md", index);
    expect(result.status).toBe("resolved");
  });

  it("detects external links", () => {
    const index = makeIndex([]);
    const result = resolveMarkdownLinkWithIndex("https://example.com", index);
    expect(result.status).toBe("external");
    if (result.status === "external") {
      expect(result.href).toBe("https://example.com");
    }
  });

  it("returns missing for unknown files", () => {
    const index = makeIndex([]);
    const result = resolveMarkdownLinkWithIndex("unknown.md", index);
    expect(result.status).toBe("missing");
  });

  it("returns missing for empty target", () => {
    const index = makeIndex([]);
    const result = resolveMarkdownLinkWithIndex("", index);
    expect(result.status).toBe("missing");
  });
});

describe("linkResolutionClass", () => {
  it("returns resolved class for resolved links", () => {
    expect(linkResolutionClass({ status: "resolved", file: makeFile("a.md") })).toBe("cm-wiki-link-resolved");
  });

  it("returns resolved class for external links", () => {
    expect(linkResolutionClass({ status: "external", href: "https://example.com" })).toBe("cm-wiki-link-resolved");
  });

  it("returns ambiguous class", () => {
    expect(linkResolutionClass({ status: "ambiguous", matches: [] })).toBe("cm-wiki-link-ambiguous");
  });

  it("returns missing class", () => {
    expect(linkResolutionClass({ status: "missing" })).toBe("cm-wiki-link-missing");
  });
});

describe("linkResolutionTitle", () => {
  it("returns file path for resolved", () => {
    expect(linkResolutionTitle({ status: "resolved", file: makeFile("a.md") })).toBe("a.md");
  });

  it("returns href for external", () => {
    expect(linkResolutionTitle({ status: "external", href: "https://x.com" })).toBe("https://x.com");
  });

  it("returns descriptive text for ambiguous", () => {
    expect(linkResolutionTitle({ status: "ambiguous", matches: [] })).toBe("Multiple matching files");
  });

  it("returns descriptive text for missing", () => {
    expect(linkResolutionTitle({ status: "missing" })).toBe("No matching file found");
  });
});
