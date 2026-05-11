import { afterEach, describe, expect, it } from "vitest";
import { createDesignIdentityService } from "./designIdentity.js";

describe("designIdentity", () => {
  afterEach(() => {
    delete process.env.KISS_AI_SKIP_DESIGN_LINT;
  });

  it("can disable DESIGN.md lint without invoking npx", async () => {
    process.env.KISS_AI_SKIP_DESIGN_LINT = "1";
    const service = createDesignIdentityService();

    await expect(service.lintDesignIdentity("/does/not/matter")).resolves.toMatchObject({
      available: false,
      ok: false,
      message: "DESIGN.md lint is disabled by KISS_AI_SKIP_DESIGN_LINT.",
    });
  });
});
