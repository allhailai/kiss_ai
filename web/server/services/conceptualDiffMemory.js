import { createHash, randomUUID } from "node:crypto";

const memoryVersion = 1;
const maxPromptRecords = 20;

function nowIso() {
  return new Date().toISOString();
}

function hashText(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function compactText(value, maxLength = 320) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9/._ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean).slice(0, 12).sort() : [];
}

function displayStringArray(value) {
  return Array.isArray(value) ? value.map((item) => compactText(item, 260)).filter(Boolean).slice(0, 12) : [];
}

function conceptualDiffFingerprintInput(diff) {
  return {
    filePath: normalizeText(diff?.filePath),
    target: {
      scope: normalizeText(diff?.target?.scope),
      sections: normalizeStringArray(diff?.target?.sections),
      anchors: normalizeStringArray(diff?.target?.anchors),
    },
    intent: {
      objective: normalizeText(diff?.intent?.objective || diff?.summary || diff?.title),
      avoid: normalizeStringArray(diff?.intent?.avoid),
    },
    applyNotes: {
      nonGoals: normalizeStringArray(diff?.applyNotes?.nonGoals),
    },
    evidence: {
      userGuidance: normalizeStringArray(diff?.evidence?.userGuidance),
      gitDiffSignals: normalizeStringArray(diff?.evidence?.gitDiffSignals),
      contextSignals: normalizeStringArray(diff?.evidence?.contextSignals),
    },
  };
}

export function conceptualDiffFingerprint(diff) {
  return hashText(JSON.stringify(conceptualDiffFingerprintInput(diff)));
}

export function conceptualDiffSemanticKey(diff, { flow = "unknown", step = "" } = {}) {
  const objective = normalizeText(diff?.intent?.objective || diff?.summary || diff?.title)
    .split(" ")
    .filter(Boolean)
    .slice(0, 8)
    .join("-");
  return [flow, step, normalizeText(diff?.filePath), objective].filter(Boolean).join(":").slice(0, 240);
}

function normalizeMemoryObject(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const reconsidersRejectedId = compactText(source.reconsidersRejectedId, 120);
  const reconsiderReason = compactText(source.reconsiderReason, 600);
  const suppressionState = ["new", "reconsidered", "near_rejected"].includes(source.suppressionState) ? source.suppressionState : "";
  const fingerprint = compactText(source.fingerprint, 80);

  if (!reconsidersRejectedId && !reconsiderReason && !suppressionState && !fingerprint) return null;

  return {
    ...(fingerprint ? { fingerprint } : {}),
    ...(reconsidersRejectedId ? { reconsidersRejectedId } : {}),
    ...(reconsiderReason ? { reconsiderReason } : {}),
    ...(suppressionState ? { suppressionState } : {}),
  };
}

export function normalizeConceptualDiffMemory(value) {
  return normalizeMemoryObject(value);
}

function recordFromDiff(diff, { existing, evidenceSnapshot = { sourceSignals: [] }, flow, now = nowIso(), sourceContentHash = "", step = "" }) {
  const fingerprint = conceptualDiffFingerprint(diff);
  return {
    id: existing?.id || `rej_${randomUUID().replaceAll("-", "").slice(0, 18)}`,
    fingerprint,
    semanticKey: conceptualDiffSemanticKey(diff, { flow, step }),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    flow,
    ...(step ? { step } : {}),
    filePath: diff.filePath,
    title: compactText(diff.title, 200),
    summary: compactText(diff.summary, 1600),
    ...(diff.target ? { target: diff.target } : {}),
    ...(diff.intent ? { intent: diff.intent } : {}),
    ...(diff.applyNotes ? { applyNotes: diff.applyNotes } : {}),
    evidenceSnapshot: {
      userGuidance: displayStringArray(diff.evidence?.userGuidance),
      gitDiffSignals: displayStringArray(diff.evidence?.gitDiffSignals),
      contextSignals: displayStringArray(diff.evidence?.contextSignals),
      sourceSignals: displayStringArray(evidenceSnapshot.sourceSignals),
    },
    ...(sourceContentHash ? { sourceContentHash } : {}),
    status: "active",
    rejectionCount: (existing?.rejectionCount ?? 0) + 1,
    lastRejectedAt: now,
    ...(existing?.reconsiderIf ? { reconsiderIf: existing.reconsiderIf } : {}),
  };
}

export function emptyConceptualDiffMemory() {
  return { version: memoryVersion, records: [] };
}

export function normalizeConceptualDiffMemoryFile(value) {
  const records = Array.isArray(value?.records) ? value.records : [];
  return {
    version: memoryVersion,
    records: records
      .filter((record) => record && typeof record === "object" && record.id && record.fingerprint)
      .map((record) => ({
        ...record,
        status: ["active", "superseded", "expired"].includes(record.status) ? record.status : "active",
      })),
  };
}

export function userGuidanceAllowsReconsideration(value) {
  return /\b(revisit|reconsider|undo|allow|allowed|try again|previously rejected|bring back|restore)\b/i.test(String(value ?? ""));
}

export function activeRejectionRecords(memory, { filePaths = null, flow = "", step = "" } = {}) {
  const allowedPaths = filePaths ? new Set(filePaths) : null;
  return (memory?.records ?? [])
    .filter((record) => record.status === "active")
    .filter((record) => !flow || record.flow === flow)
    .filter((record) => !step || record.step === step)
    .filter((record) => !allowedPaths || allowedPaths.has(record.filePath));
}

export function findExactRejectedRecord(diff, records) {
  const fingerprint = conceptualDiffFingerprint(diff);
  return records.find((record) => record.fingerprint === fingerprint) ?? null;
}

function findRecordById(records, id) {
  return records.find((record) => record.id === id) ?? null;
}

export function annotateConceptualDiffsWithMemory(conceptualDiffs, activeRecords) {
  return conceptualDiffs.map((diff) => {
    const fingerprint = conceptualDiffFingerprint(diff);
    const sourceMemory = normalizeConceptualDiffMemory(diff.memory) ?? {};
    const reconsidered = sourceMemory.reconsidersRejectedId ? findRecordById(activeRecords, sourceMemory.reconsidersRejectedId) : null;
    const exact = findExactRejectedRecord(diff, activeRecords);
    return {
      ...diff,
      memory: {
        ...sourceMemory,
        fingerprint,
        suppressionState: sourceMemory.reconsidersRejectedId || reconsidered ? "reconsidered" : exact ? "near_rejected" : sourceMemory.suppressionState || "new",
      },
    };
  });
}

export function filterSuppressedConceptualDiffs(conceptualDiffs, activeRecords, { userInstruction = "" } = {}) {
  if (userGuidanceAllowsReconsideration(userInstruction)) return conceptualDiffs;
  return conceptualDiffs.filter((diff) => diff.memory?.reconsidersRejectedId || !findExactRejectedRecord(diff, activeRecords));
}

export function buildRejectionMemoryPromptContext(memory, { filePaths = null, flow = "", step = "", userInstruction = "" } = {}) {
  const records = activeRejectionRecords(memory, { filePaths, flow, step }).slice(-maxPromptRecords);
  return {
    rules: [
      "Treat these records as soft suppressions, not permanent bans.",
      "Do not re-propose an exact rejected concept unless the user explicitly asks to revisit it.",
      "Avoid near-duplicates unless fresh evidence materially changes the proposal.",
      "If reconsidering a rejected concept, include memory.reconsidersRejectedId and memory.reconsiderReason on the conceptual diff.",
      "Prefer a narrower or corrected proposal over repeating the rejected one.",
    ],
    userInstructionAllowsReconsideration: userGuidanceAllowsReconsideration(userInstruction),
    records: records.map((record) => ({
      id: record.id,
      fingerprint: record.fingerprint,
      semanticKey: record.semanticKey,
      flow: record.flow,
      ...(record.step ? { step: record.step } : {}),
      filePath: record.filePath,
      title: record.title,
      summary: record.summary,
      ...(record.target ? { target: record.target } : {}),
      ...(record.intent ? { intent: record.intent } : {}),
      ...(record.applyNotes ? { applyNotes: record.applyNotes } : {}),
      evidenceSnapshot: record.evidenceSnapshot,
      rejectionCount: record.rejectionCount,
      lastRejectedAt: record.lastRejectedAt,
      ...(record.reconsiderIf ? { reconsiderIf: record.reconsiderIf } : {}),
    })),
  };
}

export function updateConceptualDiffRejectionMemory(
  memory,
  { conceptualDiffs, evidenceSnapshot = { sourceSignals: [] }, flow, now = nowIso(), sourceContentHash = "", sourceContentHashByPath = null, step = "" },
) {
  const normalizedMemory = normalizeConceptualDiffMemoryFile(memory);
  const records = [...normalizedMemory.records];

  conceptualDiffs.forEach((diff) => {
    if (!diff?.filePath) return;
    const reconsideredId = diff.memory?.reconsidersRejectedId;
    if (diff.status === "accepted" && reconsideredId) {
      const index = records.findIndex((record) => record.id === reconsideredId && record.status === "active");
      if (index >= 0) {
        records[index] = { ...records[index], status: "superseded", updatedAt: now };
      }
      return;
    }

    if (diff.status !== "rejected") return;

    const fingerprint = conceptualDiffFingerprint(diff);
    const existingIndex = records.findIndex((record) => record.fingerprint === fingerprint && record.flow === flow && record.filePath === diff.filePath && record.status === "active");
    const existing = existingIndex >= 0 ? records[existingIndex] : null;
    const record = recordFromDiff(diff, {
      evidenceSnapshot,
      existing,
      flow,
      now,
      sourceContentHash: sourceContentHashByPath?.get(diff.filePath) ?? sourceContentHash,
      step,
    });

    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }
  });

  return normalizeConceptualDiffMemoryFile({ version: memoryVersion, records });
}
