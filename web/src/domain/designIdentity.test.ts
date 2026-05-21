import { describe, expect, it } from "vitest";
import { asRecord, asString, isHexColor, parseDesignIdentityDraft, serializeDesignIdentityDraft } from "./designIdentity";

describe("designIdentity helpers", () => {
  describe("asString", () => {
    it("returns empty string for null and undefined", () => {
      expect(asString(null)).toBe("");
      expect(asString(undefined)).toBe("");
    });

    it("coerces values to strings", () => {
      expect(asString(42)).toBe("42");
      expect(asString(true)).toBe("true");
      expect(asString("hello")).toBe("hello");
    });
  });

  describe("asRecord", () => {
    it("returns the object for plain objects", () => {
      const obj = { a: 1 };
      expect(asRecord(obj)).toBe(obj);
    });

    it("returns empty object for non-objects", () => {
      expect(asRecord(null)).toEqual({});
      expect(asRecord(undefined)).toEqual({});
      expect(asRecord("string")).toEqual({});
      expect(asRecord(42)).toEqual({});
      expect(asRecord([1, 2])).toEqual({});
    });
  });

  describe("isHexColor", () => {
    it("accepts valid 6-digit hex colors", () => {
      expect(isHexColor("#ff0000")).toBe(true);
      expect(isHexColor("#AABBCC")).toBe(true);
      expect(isHexColor("#123abc")).toBe(true);
    });

    it("rejects invalid formats", () => {
      expect(isHexColor("#fff")).toBe(false);
      expect(isHexColor("ff0000")).toBe(false);
      expect(isHexColor("#gggggg")).toBe(false);
      expect(isHexColor("#ff00001")).toBe(false);
      expect(isHexColor("")).toBe(false);
    });
  });
});

describe("parseDesignIdentityDraft", () => {
  it("parses markdown with frontmatter and sections", () => {
    const markdown = `---
name: Test
---

Opening paragraph.

## Section One

Content one.

## Section Two

Content two.
`;
    const result = parseDesignIdentityDraft(markdown);
    expect(result.parseError).toBeNull();
    expect(result.frontmatter).toEqual({ name: "Test" });
    expect(result.opening.trim()).toBe("Opening paragraph.");
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toEqual({ title: "Section One", content: "Content one." });
    expect(result.sections[1]).toEqual({ title: "Section Two", content: "Content two." });
  });

  it("handles empty input", () => {
    const result = parseDesignIdentityDraft("");
    expect(result.parseError).toBeNull();
    expect(result.frontmatter).toEqual({});
    expect(result.opening).toBe("");
    expect(result.sections).toHaveLength(0);
  });

  it("handles markdown without frontmatter", () => {
    const markdown = "Just some text\n\n## A Section\n\nWith content.";
    const result = parseDesignIdentityDraft(markdown);
    expect(result.opening).toBe("Just some text");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].title).toBe("A Section");
  });

  it("handles markdown without sections", () => {
    const markdown = "---\nkey: value\n---\nJust body text.";
    const result = parseDesignIdentityDraft(markdown);
    expect(result.frontmatter).toEqual({ key: "value" });
    expect(result.opening).toBe("Just body text.");
    expect(result.sections).toHaveLength(0);
  });
});

describe("serializeDesignIdentityDraft round-trip", () => {
  it("serializes and re-parses to the same structure", () => {
    const original = parseDesignIdentityDraft(`---
name: Round Trip
color: "#ff0000"
---

Opening.

## Section A

Content A.
`);
    const serialized = serializeDesignIdentityDraft(original);
    const reparsed = parseDesignIdentityDraft(serialized);

    expect(reparsed.frontmatter).toEqual(original.frontmatter);
    expect(reparsed.opening.trim()).toBe(original.opening.trim());
    expect(reparsed.sections).toEqual(original.sections);
    expect(reparsed.parseError).toBeNull();
  });
});
