import { describe, expect, it } from "vitest";
import { formatLocalDateTime, formatLocalTime } from "./formatters";

describe("formatLocalDateTime", () => {
  it("returns emptyLabel for null", () => {
    expect(formatLocalDateTime(null)).toBe("None");
  });

  it("returns emptyLabel for undefined", () => {
    expect(formatLocalDateTime(undefined)).toBe("None");
  });

  it("returns custom emptyLabel", () => {
    expect(formatLocalDateTime(null, "N/A")).toBe("N/A");
  });

  it("returns raw string for invalid dates", () => {
    expect(formatLocalDateTime("not-a-date")).toBe("not-a-date");
  });

  it("formats a valid ISO timestamp", () => {
    const result = formatLocalDateTime("2024-01-15T10:30:00Z");
    // Result format varies by locale but should be a non-empty string
    expect(result).toBeTruthy();
    expect(result).not.toBe("None");
    expect(result).not.toBe("2024-01-15T10:30:00Z");
  });
});

describe("formatLocalTime", () => {
  it("returns emptyLabel for null", () => {
    expect(formatLocalTime(null)).toBe("None");
  });

  it("returns emptyLabel for undefined", () => {
    expect(formatLocalTime(undefined)).toBe("None");
  });

  it("returns custom emptyLabel", () => {
    expect(formatLocalTime(null, "—")).toBe("—");
  });

  it("returns raw string for invalid dates", () => {
    expect(formatLocalTime("bad-date")).toBe("bad-date");
  });

  it("formats a valid ISO timestamp to time-only", () => {
    const result = formatLocalTime("2024-01-15T10:30:45Z");
    expect(result).toBeTruthy();
    expect(result).not.toBe("None");
  });
});
