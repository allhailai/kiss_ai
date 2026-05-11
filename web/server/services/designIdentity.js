import { execFile } from "node:child_process";
import YAML from "yaml";

export function createDesignIdentityService() {
  function parseDesignIdentity(markdown) {
    const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const tokens = match ? YAML.parse(match[1]) ?? {} : {};

    return {
      name: String(tokens.name ?? "kiss_ai Default"),
      description: String(tokens.description ?? ""),
      colors: tokens.colors ?? {},
      typography: tokens.typography ?? {},
      spacing: tokens.spacing ?? {},
      rounded: tokens.rounded ?? {},
      components: tokens.components ?? {},
    };
  }

  async function lintDesignIdentity(projectRoot) {
    if (process.env.KISS_AI_SKIP_DESIGN_LINT === "1") {
      return {
        available: false,
        ok: false,
        output: null,
        message: "DESIGN.md lint is disabled by KISS_AI_SKIP_DESIGN_LINT.",
      };
    }

    return new Promise((resolve) => {
      execFile(
        "npx",
        ["@google/design.md", "lint", "human_design_identity.md"],
        { cwd: projectRoot, timeout: 30000 },
        (error, stdout, stderr) => {
          if (error) {
            resolve({
              available: false,
              ok: false,
              output: stdout || stderr,
              message: "DESIGN.md lint is unavailable or reported findings.",
            });
            return;
          }

          const parsedOutput = safeParseLintOutput(stdout);
          resolve({
            available: true,
            ok: parsedOutput.ok,
            output: parsedOutput.output,
            message: parsedOutput.ok ? "DESIGN.md lint passed." : "DESIGN.md lint output could not be parsed.",
          });
        },
      );
    });
  }

  function safeParseLintOutput(stdout) {
    if (!stdout) return { ok: true, output: null };

    try {
      return { ok: true, output: JSON.parse(stdout) };
    } catch {
      return {
        ok: false,
        output: {
          raw: stdout,
          warning: "DESIGN.md lint output was not JSON.",
        },
      };
    }
  }

  return { lintDesignIdentity, parseDesignIdentity };
}
