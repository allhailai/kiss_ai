import fs from "node:fs/promises";
import path from "node:path";

const maxEvents = 500;
const maxLogEntries = 300;
const rebuildStatuses = new Set(["idle", "running", "finished", "finished_with_attention", "error", "blocked", "interrupted"]);
const eventTypes = new Set(["system", "assistant_message", "run_status", "tool_activity", "artifact_change", "error"]);

function nowIso() {
  return new Date().toISOString();
}

function createEventId(type) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatEventLogEntry(event) {
  const text = event.text || event.title || event.status || "";
  if (!text) return null;
  return `[${event.updatedAt ?? event.createdAt}] ${text}`;
}

function deriveLog(events, fallbackLog = []) {
  const eventLog = events.map(formatEventLogEntry).filter(Boolean);
  return (eventLog.length ? eventLog : fallbackLog).slice(-maxLogEntries);
}

function normalizeEvent(value) {
  const source = value && typeof value === "object" ? value : {};
  const type = eventTypes.has(source.type) ? source.type : "system";
  const createdAt = typeof source.createdAt === "string" ? source.createdAt : nowIso();
  const updatedAt = typeof source.updatedAt === "string" ? source.updatedAt : createdAt;
  const text = typeof source.text === "string" ? source.text : "";
  const title = typeof source.title === "string" ? source.title : "";
  const status = typeof source.status === "string" ? source.status : null;
  const runtime = typeof source.runtime === "string" ? source.runtime : null;
  const role = typeof source.role === "string" ? source.role : type === "assistant_message" ? "assistant" : "system";
  const metadata = source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata) ? source.metadata : {};

  return {
    id: typeof source.id === "string" ? source.id : createEventId(type),
    type,
    role,
    title,
    text,
    status,
    runtime,
    metadata,
    createdAt,
    updatedAt,
  };
}

export function createIdleRebuildState() {
  return {
    running: false,
    runId: null,
    agentId: null,
    runtime: "cursor",
    status: "idle",
    startedAt: null,
    finishedAt: null,
    modelId: null,
    message: "No rebuild has been started from the UI.",
    activeAssistantMessageId: null,
    events: [],
    log: [],
  };
}

export function normalizeRebuildState(value) {
  const fallback = createIdleRebuildState();
  const source = value && typeof value === "object" ? value : {};
  const status = rebuildStatuses.has(source.status) ? source.status : fallback.status;
  const legacyLog = Array.isArray(source.log) ? source.log.filter((entry) => typeof entry === "string").slice(-maxLogEntries) : [];
  const firstLegacyTimestamp = legacyLog[0]?.match(/^\[([^\]]+)\]/)?.[1];
  const lastLegacyTimestamp = legacyLog.at(-1)?.match(/^\[([^\]]+)\]/)?.[1];
  const events = Array.isArray(source.events)
    ? source.events.map(normalizeEvent).slice(-maxEvents)
    : legacyLog.length
      ? [
          normalizeEvent({
            type: "system",
            title: "Legacy runner log",
            text: "This run was recorded before conversational events were available. Open the raw runner log for details.",
            createdAt: firstLegacyTimestamp,
            updatedAt: lastLegacyTimestamp,
          }),
        ]
      : [];

  return {
    running: Boolean(source.running),
    runId: typeof source.runId === "string" ? source.runId : null,
    agentId: typeof source.agentId === "string" ? source.agentId : null,
    runtime: typeof source.runtime === "string" ? source.runtime : fallback.runtime,
    status,
    startedAt: typeof source.startedAt === "string" ? source.startedAt : null,
    finishedAt: typeof source.finishedAt === "string" ? source.finishedAt : null,
    modelId: typeof source.modelId === "string" ? source.modelId : null,
    message: typeof source.message === "string" ? source.message : fallback.message,
    activeAssistantMessageId: typeof source.activeAssistantMessageId === "string" ? source.activeAssistantMessageId : null,
    events,
    log: deriveLog(events, legacyLog),
  };
}

export function createRebuildStore({ stateDir, projectSlugPattern }) {
  const rebuildStates = new Map();
  const activeRebuilds = new Set();
  const subscribers = new Map();

  function rebuildStatePath(projectSlug) {
    if (!projectSlugPattern.test(projectSlug)) {
      throw new Error("Invalid project slug.");
    }

    return path.join(stateDir, `${projectSlug}.json`);
  }

  async function readPersistedRebuildState(projectSlug) {
    try {
      return normalizeRebuildState(JSON.parse(await fs.readFile(rebuildStatePath(projectSlug), "utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn(`[kiss_ai UI warning] Could not read rebuild state for ${projectSlug}: ${error.message}`);
      }

      return createIdleRebuildState();
    }
  }

  async function writePersistedRebuildState(projectSlug, state) {
    await fs.mkdir(stateDir, { recursive: true });

    const target = rebuildStatePath(projectSlug);
    const temporary = `${target}.${process.pid}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(normalizeRebuildState(state), null, 2)}\n`, "utf8");
    await fs.rename(temporary, target);
  }

  function notify(projectSlug, state, event = null) {
    const projectSubscribers = subscribers.get(projectSlug);
    if (!projectSubscribers?.size) return;

    for (const subscriber of projectSubscribers) {
      subscriber({ state, event });
    }
  }

  function markInterruptedRebuildState(state) {
    const finishedAt = nowIso();
    const message = "Rebuild status is unknown because the web server restarted while this run was marked running.";
    const event = normalizeEvent({
      type: "error",
      title: "Run interrupted",
      text: message,
      status: "interrupted",
      createdAt: finishedAt,
      updatedAt: finishedAt,
    });
    const events = [...state.events.slice(-(maxEvents - 1)), event];

    return {
      ...state,
      running: false,
      status: "interrupted",
      finishedAt,
      message,
      activeAssistantMessageId: null,
      events,
      log: deriveLog(events, state.log),
    };
  }

  async function getRebuildState(projectSlug) {
    const existing = rebuildStates.get(projectSlug);
    if (existing) return existing;

    let next = await readPersistedRebuildState(projectSlug);

    if (next.running && !activeRebuilds.has(projectSlug)) {
      next = markInterruptedRebuildState(next);
      await writePersistedRebuildState(projectSlug, next);
    }

    rebuildStates.set(projectSlug, next);
    return next;
  }

  async function setRebuildState(projectSlug, nextState, emittedEvent = null) {
    const normalized = normalizeRebuildState(nextState);
    rebuildStates.set(projectSlug, normalized);
    await writePersistedRebuildState(projectSlug, normalized);
    notify(projectSlug, normalized, emittedEvent);
    return normalized;
  }

  async function appendRunEvent(projectSlug, eventInput) {
    const rebuildState = await getRebuildState(projectSlug);
    const event = normalizeEvent(eventInput);
    const events = [...rebuildState.events.slice(-(maxEvents - 1)), event];
    return await setRebuildState(
      projectSlug,
      {
        ...rebuildState,
        events,
        log: deriveLog(events, rebuildState.log),
      },
      event,
    );
  }

  async function appendAssistantDelta(projectSlug, text, metadata = {}) {
    if (!text) return await getRebuildState(projectSlug);

    const rebuildState = await getRebuildState(projectSlug);
    const timestamp = nowIso();
    const events = [...rebuildState.events];
    const activeIndex = rebuildState.activeAssistantMessageId
      ? events.findIndex((event) => event.id === rebuildState.activeAssistantMessageId && event.type === "assistant_message")
      : -1;
    let event;

    if (activeIndex >= 0 && events[activeIndex].status === "streaming") {
      event = normalizeEvent({
        ...events[activeIndex],
        text: `${events[activeIndex].text}${text}`,
        updatedAt: timestamp,
        metadata: { ...events[activeIndex].metadata, ...metadata },
      });
      events[activeIndex] = event;
    } else {
      event = normalizeEvent({
        type: "assistant_message",
        role: "assistant",
        title: "Assistant",
        text,
        status: "streaming",
        runtime: "cursor",
        metadata,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      events.push(event);
    }

    return await setRebuildState(
      projectSlug,
      {
        ...rebuildState,
        activeAssistantMessageId: event.id,
        events: events.slice(-maxEvents),
        log: deriveLog(events, rebuildState.log),
      },
      event,
    );
  }

  async function finishAssistantMessage(projectSlug) {
    const rebuildState = await getRebuildState(projectSlug);
    if (!rebuildState.activeAssistantMessageId) return rebuildState;

    const timestamp = nowIso();
    let finishedEvent = null;
    const events = rebuildState.events.map((event) => {
      if (event.id !== rebuildState.activeAssistantMessageId || event.type !== "assistant_message") return event;
      finishedEvent = normalizeEvent({
        ...event,
        status: "complete",
        text: event.text.trim(),
        updatedAt: timestamp,
      });
      return finishedEvent;
    });

    return await setRebuildState(
      projectSlug,
      {
        ...rebuildState,
        activeAssistantMessageId: null,
        events,
        log: deriveLog(events, rebuildState.log),
      },
      finishedEvent,
    );
  }

  function subscribe(projectSlug, subscriber) {
    const projectSubscribers = subscribers.get(projectSlug) ?? new Set();
    projectSubscribers.add(subscriber);
    subscribers.set(projectSlug, projectSubscribers);

    return () => {
      projectSubscribers.delete(subscriber);
      if (!projectSubscribers.size) subscribers.delete(projectSlug);
    };
  }

  return {
    activeRebuilds,
    appendAssistantDelta,
    appendRunEvent,
    finishAssistantMessage,
    getRebuildState,
    setRebuildState,
    subscribe,
  };
}
