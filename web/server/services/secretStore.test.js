import { describe, expect, it } from "vitest";
import { createSecretStore } from "./secretStore.js";

function createMockExecFileText(returnValue = "", fail = false) {
  const calls = [];
  const fn = async (command, args) => {
    calls.push({ command, args });
    if (fail) throw new Error("command failed");
    return returnValue;
  };
  fn.calls = calls;
  return fn;
}

describe("secretStore", () => {
  describe("macOS (darwin)", () => {
    it("reads a secret from the macOS Keychain", async () => {
      const exec = createMockExecFileText("my-secret-value");
      const store = createSecretStore({ execFileText: exec, platform: "darwin", userName: "testuser" });

      const value = await store.read("cursor_api_key");

      expect(value).toBe("my-secret-value");
      expect(exec.calls).toEqual([
        {
          command: "security",
          args: ["find-generic-password", "-a", "testuser", "-s", "cursor_api_key", "-w"],
        },
      ]);
    });

    it("returns null when the Keychain item is missing", async () => {
      const exec = createMockExecFileText("", true);
      const store = createSecretStore({ execFileText: exec, platform: "darwin", userName: "testuser" });

      expect(await store.read("cursor_api_key")).toBeNull();
    });

    it("returns null when the Keychain returns an empty string", async () => {
      const exec = createMockExecFileText("");
      const store = createSecretStore({ execFileText: exec, platform: "darwin", userName: "testuser" });

      expect(await store.read("cursor_api_key")).toBeNull();
    });

    it("writes a secret to the macOS Keychain", async () => {
      const exec = createMockExecFileText("");
      const store = createSecretStore({ execFileText: exec, platform: "darwin", userName: "testuser" });

      await store.write("cursor_api_key", "new-secret");

      expect(exec.calls).toEqual([
        {
          command: "security",
          args: ["add-generic-password", "-U", "-a", "testuser", "-s", "cursor_api_key", "-w", "new-secret"],
        },
      ]);
    });

    it("throws when writing to the Keychain fails", async () => {
      const exec = createMockExecFileText("", true);
      const store = createSecretStore({ execFileText: exec, platform: "darwin", userName: "testuser" });

      await expect(store.write("cursor_api_key", "value")).rejects.toThrow();
    });

    it("returns the correct source label", () => {
      const exec = createMockExecFileText();
      const store = createSecretStore({ execFileText: exec, platform: "darwin" });

      expect(store.sourceLabel("cursor_api_key")).toBe("macOS Keychain item cursor_api_key");
    });

    it("reports as supported", () => {
      const exec = createMockExecFileText();
      const store = createSecretStore({ execFileText: exec, platform: "darwin" });

      expect(store.supported).toBe(true);
    });
  });

  describe("Linux", () => {
    it("reads a secret from secret-tool", async () => {
      const exec = createMockExecFileText("linux-secret");
      const store = createSecretStore({ execFileText: exec, platform: "linux", userName: "testuser" });

      const value = await store.read("cursor_api_key");

      expect(value).toBe("linux-secret");
      expect(exec.calls).toEqual([
        {
          command: "secret-tool",
          args: ["lookup", "service", "cursor_api_key"],
        },
      ]);
    });

    it("returns null when the secret-tool item is missing", async () => {
      const exec = createMockExecFileText("", true);
      const store = createSecretStore({ execFileText: exec, platform: "linux", userName: "testuser" });

      expect(await store.read("cursor_api_key")).toBeNull();
    });

    it("returns null when secret-tool returns an empty string", async () => {
      const exec = createMockExecFileText("");
      const store = createSecretStore({ execFileText: exec, platform: "linux", userName: "testuser" });

      expect(await store.read("cursor_api_key")).toBeNull();
    });

    it("returns the correct source label", () => {
      const exec = createMockExecFileText();
      const store = createSecretStore({ execFileText: exec, platform: "linux" });

      expect(store.sourceLabel("cursor_api_key")).toBe("Linux secret-tool item cursor_api_key");
    });

    it("reports as supported", () => {
      const exec = createMockExecFileText();
      const store = createSecretStore({ execFileText: exec, platform: "linux" });

      expect(store.supported).toBe(true);
    });
  });

  describe("unsupported platform", () => {
    it("returns null on read", async () => {
      const exec = createMockExecFileText();
      const store = createSecretStore({ execFileText: exec, platform: "win32" });

      expect(await store.read("cursor_api_key")).toBeNull();
    });

    it("throws on write", async () => {
      const exec = createMockExecFileText();
      const store = createSecretStore({ execFileText: exec, platform: "win32" });

      await expect(store.write("cursor_api_key", "value")).rejects.toThrow(/not supported on platform/);
    });

    it("returns a generic source label", () => {
      const exec = createMockExecFileText();
      const store = createSecretStore({ execFileText: exec, platform: "win32" });

      expect(store.sourceLabel("cursor_api_key")).toBe("OS credential store item cursor_api_key");
    });

    it("reports as not supported", () => {
      const exec = createMockExecFileText();
      const store = createSecretStore({ execFileText: exec, platform: "win32" });

      expect(store.supported).toBe(false);
    });
  });
});
