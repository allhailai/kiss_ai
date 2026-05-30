/**
 * Platform-agnostic secret store abstraction.
 *
 * On macOS, delegates to the system `security` CLI (Keychain).
 * On Linux, delegates to `secret-tool` (libsecret / D-Bus Secret Service)
 * when available. Falls back to unsupported on headless servers.
 * On unsupported platforms, read returns null and write throws.
 */

import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";

/**
 * Check whether a command-line tool is installed and on PATH.
 */
function isCommandAvailable(command) {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a command and pipe `stdinData` to its stdin, resolving with stdout.
 * Used for `secret-tool store` which reads the secret value from stdin.
 */
function execWithStdin(command, args, stdinData) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        const error = new Error(`${command} exited with code ${code}: ${stderr.trim()}`);
        reject(error);
        return;
      }

      resolve(String(stdout || stderr).trim());
    });

    child.stdin.write(stdinData);
    child.stdin.end();
  });
}

export function createSecretStore({ execFileText, isCommandAvailable: probe = isCommandAvailable, platform = process.platform, userName = process.env.USER ?? "" }) {
  async function readDarwin(serviceName) {
    try {
      const value = await execFileText("security", [
        "find-generic-password",
        "-a",
        userName,
        "-s",
        serviceName,
        "-w",
      ]);
      return value || null;
    } catch {
      return null;
    }
  }

  async function writeDarwin(serviceName, value) {
    await execFileText("security", [
      "add-generic-password",
      "-U",
      "-a",
      userName,
      "-s",
      serviceName,
      "-w",
      value,
    ]);
  }

  async function readLinux(serviceName) {
    try {
      const value = await execFileText("secret-tool", [
        "lookup",
        "service",
        serviceName,
      ]);
      return value || null;
    } catch {
      return null;
    }
  }

  async function writeLinux(serviceName, value) {
    await execWithStdin("secret-tool", [
      "store",
      "--label",
      `kiss_ai ${serviceName}`,
      "service",
      serviceName,
    ], value);
  }

  function sourceLabelDarwin(serviceName) {
    return `macOS Keychain item ${serviceName}`;
  }

  function sourceLabelLinux(serviceName) {
    return `Linux secret-tool item ${serviceName}`;
  }

  if (platform === "darwin") {
    return {
      read: readDarwin,
      write: writeDarwin,
      sourceLabel: sourceLabelDarwin,
      supported: true,
    };
  }

  if (platform === "linux" && probe("secret-tool")) {
    return {
      read: readLinux,
      write: writeLinux,
      sourceLabel: sourceLabelLinux,
      supported: true,
    };
  }

  return {
    read: async () => null,
    write: async () => {
      throw new Error(`Secret storage is not supported on platform "${platform}". Use the CURSOR_API_KEY environment variable or web/.env instead.`);
    },
    sourceLabel: (serviceName) => `OS credential store item ${serviceName}`,
    supported: false,
  };
}

