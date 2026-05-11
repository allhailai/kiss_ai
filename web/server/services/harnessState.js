import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function hashStableValue(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function normalizeHumanAttentionItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return {
      id: `legacy_${hashStableValue({ value: String(item) })}`,
      severity: "warning",
      category: "review",
      summary: String(item),
      resolution_options: [],
    };
  }

  const source = item;
  const summary =
    typeof source.summary === "string"
      ? source.summary
      : typeof source.issue === "string"
        ? source.issue
        : typeof source.message === "string"
          ? source.message
          : "Review needed.";
  const legacyId = hashStableValue({
    severity: source.severity,
    category: source.category,
    summary,
    next_human_action: source.next_human_action ?? source.nextAction,
    default_action_taken: source.default_action_taken,
  });

  return {
    ...source,
    id: typeof source.id === "string" && source.id.trim() ? source.id : `legacy_${legacyId}`,
    summary,
    resolution_options: Array.isArray(source.resolution_options) ? source.resolution_options : [],
  };
}

export function createHarnessStateService(options = {}) {
  const httpError = options.httpError;
  async function readProjectHarness(projectRoot) {
    const harnessPath = path.join(projectRoot, ".harness-state.json");
    try {
      return JSON.parse(await fs.readFile(harnessPath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return {};
      if (error instanceof SyntaxError) {
        if (httpError) {
          throw httpError("Could not parse .harness-state.json. Fix or remove the corrupt harness file.", 500, "corrupt_harness_state");
        }
        throw error;
      }
      if (httpError) {
        throw httpError("Could not read .harness-state.json.", 500, "harness_state_unreadable");
      }
      throw error;
    }
  }

  function getHumanAttentionItems(harness) {
    const items = harness?.extensions?.human_attention?.open_items;
    return Array.isArray(items) ? items.map(normalizeHumanAttentionItem) : [];
  }

  return {
    getHumanAttentionItems,
    readProjectHarness,
  };
}
