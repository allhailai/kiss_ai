import { randomUUID } from "node:crypto";
import { normalizeConceptualDiffMemory } from "./conceptualDiffMemory.js";

export function firstTagContent(text, tagName, { trim = true } = {}) {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const value = String(text ?? "").match(pattern)?.[1] ?? "";
  return trim ? value.trim() : value;
}

export function parseJsonTaggedContent(text, tagName) {
  const tagged = firstTagContent(text, tagName);
  const candidate = tagged || String(text ?? "").trim();
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch {
    const jsonMatch = candidate.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

function createConceptualDiffId(prefix = "diff") {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function trimOptionalText(value, maxLength) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : "";
}

function normalizeStringList(value, maxItems = 8, maxLength = 240) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => trimOptionalText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function normalizeConceptualDiffScope(value) {
  return ["local", "section", "multi_section", "document"].includes(value) ? value : "";
}

function normalizeConceptualDiffTarget(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sections = normalizeStringList(source.sections);
  const anchors = normalizeStringList(source.anchors);
  const explicitScope = normalizeConceptualDiffScope(source.scope);
  const inferredScope = sections.length > 1 ? "multi_section" : sections.length ? "section" : anchors.length ? "local" : "";
  const scope = explicitScope || inferredScope;

  if (!scope) return null;

  return {
    scope,
    ...(sections.length ? { sections } : {}),
    ...(anchors.length ? { anchors } : {}),
  };
}

function normalizeConceptualDiffIntent(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const objective = trimOptionalText(source.objective, 800);
  if (!objective) return null;

  const rationale = trimOptionalText(source.rationale, 800);
  const mustPreserve = normalizeStringList(source.mustPreserve, 8, 260);
  const avoid = normalizeStringList(source.avoid, 8, 260);

  return {
    objective,
    ...(rationale ? { rationale } : {}),
    ...(mustPreserve.length ? { mustPreserve } : {}),
    ...(avoid.length ? { avoid } : {}),
  };
}

function normalizeConceptualDiffEvidence(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const userGuidance = normalizeStringList(source.userGuidance, 6, 260);
  const gitDiffSignals = normalizeStringList(source.gitDiffSignals, 6, 260);
  const contextSignals = normalizeStringList(source.contextSignals, 6, 260);

  if (!userGuidance.length && !gitDiffSignals.length && !contextSignals.length) return null;

  return {
    ...(userGuidance.length ? { userGuidance } : {}),
    ...(gitDiffSignals.length ? { gitDiffSignals } : {}),
    ...(contextSignals.length ? { contextSignals } : {}),
  };
}

function normalizeConceptualDiffApplyNotes(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const expectedChangeShape = trimOptionalText(source.expectedChangeShape, 600);
  const nonGoals = normalizeStringList(source.nonGoals, 8, 260);
  const riskLevel = ["low", "medium", "high"].includes(source.riskLevel) ? source.riskLevel : "";

  if (!expectedChangeShape && !nonGoals.length && !riskLevel) return null;

  return {
    ...(expectedChangeShape ? { expectedChangeShape } : {}),
    ...(nonGoals.length ? { nonGoals } : {}),
    ...(riskLevel ? { riskLevel } : {}),
  };
}

export function normalizeConceptualDiff(value, authorizedEditablePaths = null, { idPrefix = "diff" } = {}) {
  const source = value && typeof value === "object" ? value : {};
  const filePath = String(source.filePath ?? source.path ?? "").trim();
  const title = String(source.title ?? "").trim();
  const summary = String(source.summary ?? source.description ?? "").trim();
  const target = normalizeConceptualDiffTarget(source.target);
  const intent = normalizeConceptualDiffIntent(source.intent);
  const evidence = normalizeConceptualDiffEvidence(source.evidence);
  const applyNotes = normalizeConceptualDiffApplyNotes(source.applyNotes);
  const memory = normalizeConceptualDiffMemory(source.memory);
  const pathIsAllowed = !authorizedEditablePaths || authorizedEditablePaths.has(filePath);

  if (!filePath || !title || !summary || !pathIsAllowed) return null;

  return {
    id: String(source.id ?? "").trim().slice(0, 80) || createConceptualDiffId(idPrefix),
    filePath,
    title: title.slice(0, 160),
    summary: summary.slice(0, 1200),
    status: source.status === "rejected" ? "rejected" : "accepted",
    ...(target ? { target } : {}),
    ...(intent ? { intent } : {}),
    ...(evidence ? { evidence } : {}),
    ...(applyNotes ? { applyNotes } : {}),
    ...(memory ? { memory } : {}),
  };
}

export function extractConceptualDiffsFromText(rawText, tagName, authorizedEditablePaths, options = {}) {
  const parsed = parseJsonTaggedContent(rawText, tagName);
  const candidates = Array.isArray(parsed?.conceptualDiffs) ? parsed.conceptualDiffs : Array.isArray(parsed) ? parsed : [];
  return candidates.map((candidate) => normalizeConceptualDiff(candidate, authorizedEditablePaths, options)).filter(Boolean);
}

export function extractApplyResultFromText(rawText, tagName, allowedFailedIds = null) {
  const parsed = parseJsonTaggedContent(rawText, tagName);
  const allowedIds = allowedFailedIds ? new Set(allowedFailedIds) : null;
  const failedConceptualDiffIds = Array.isArray(parsed?.failedConceptualDiffIds)
    ? parsed.failedConceptualDiffIds.filter((id) => typeof id === "string" && (!allowedIds || allowedIds.has(id)))
    : [];
  return {
    failedConceptualDiffIds,
    notice: typeof parsed?.notice === "string" && parsed.notice.trim() ? parsed.notice.trim().slice(0, 1200) : "",
    valid: Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed)),
  };
}
