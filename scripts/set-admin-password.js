#!/usr/bin/env node

/**
 * Set or reset the kissai_admin password.
 *
 * Usage (run directly on the server box):
 *   node scripts/set-admin-password.js
 *
 * This script does not require the server to be running.
 * It reads/writes .kiss_ai_auth.json at the projects root.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthService } from "../web/server/services/auth.js";
import { httpError } from "../web/server/services/httpErrors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(__dirname, "..");
const WEB_ROOT = path.resolve(HUB_ROOT, "web");
const PROJECTS_ROOT = path.resolve(process.env.KISS_AI_PROJECTS_ROOT ?? path.resolve(WEB_ROOT, "..",".."));

const authService = createAuthService({ projectsRoot: PROJECTS_ROOT, httpError, sessionExpiryDays: 3 });

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log("\n=== kiss_ai Admin Password Reset ===\n");
    console.log(`Auth file: ${path.join(PROJECTS_ROOT, ".kiss_ai_auth.json")}\n`);

    const password = await rl.question("Enter new admin password (min 8 chars): ");

    if (!password || password.length < 8) {
      console.error("\nError: Password must be at least 8 characters.");
      process.exit(1);
    }

    const confirm = await rl.question("Confirm new admin password: ");

    if (password !== confirm) {
      console.error("\nError: Passwords do not match.");
      process.exit(1);
    }

    // Initialize if auth file doesn't exist, or update the admin password directly
    const user = await authService.findUser("kissai_admin");

    if (!user) {
      // First boot scenario — initialize with this password
      await authService.initialize(password);
      console.log("\nAdmin user created and password set successfully.");
    } else {
      // Auth file exists — directly hash and update the admin password
      // This bypasses the normal changePassword flow (which requires current password)
      // because this script has filesystem access = server box access
      const fs = await import("node:fs/promises");
      const authFilePath = path.join(PROJECTS_ROOT, ".kiss_ai_auth.json");
      const raw = await fs.readFile(authFilePath, "utf-8");
      const data = JSON.parse(raw);

      const admin = data.users.find((u) => u.username === "kissai_admin");
      if (!admin) {
        console.error("\nError: kissai_admin user not found in auth file.");
        process.exit(1);
      }

      admin.password_hash = await authService.hashPassword(password);
      admin.token_version = (admin.token_version ?? 0) + 1;
      admin.updated_at = new Date().toISOString();

      await fs.writeFile(authFilePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
      console.log("\nAdmin password updated successfully.");
      console.log("All existing admin sessions have been invalidated (token_version bumped).");
    }

    console.log("");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`\nFatal error: ${error.message}`);
  process.exit(1);
});
