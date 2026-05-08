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

          resolve({
            available: true,
            ok: true,
            output: stdout ? JSON.parse(stdout) : null,
            message: "DESIGN.md lint passed.",
          });
        },
      );
    });
  }

  return { lintDesignIdentity, parseDesignIdentity };
}
