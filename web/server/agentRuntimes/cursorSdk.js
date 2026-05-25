import { Agent, CursorAgentError } from "@cursor/sdk";

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error("Agent operation was cancelled.");
    error.name = "AbortError";
    throw error;
  }
}

export async function runCursorAgent({ project, apiKey, modelId, prompt, onEvent, signal }) {
  let agent;

  try {
    throwIfAborted(signal);

    agent = await Agent.create({
      apiKey,
      model: { id: modelId },
      local: { cwd: project.path },
    });

    throwIfAborted(signal);

    await onEvent({
      type: "run_status",
      title: "Agent created",
      text: `Agent created: ${agent.agentId ?? "local"}`,
      status: "agent_created",
      runtime: "cursor",
      metadata: { agentId: agent.agentId ?? null },
    });

    const run = await agent.send(prompt);

    throwIfAborted(signal);

    await onEvent({
      type: "run_status",
      title: "Run started",
      text: `Run started: ${run.id ?? "unknown"}`,
      status: "run_started",
      runtime: "cursor",
      metadata: { runId: run.id ?? null },
    });

    if (run.supports("stream")) {
      for await (const event of run.stream()) {
        throwIfAborted(signal);

        if (event.type !== "assistant") continue;

        for (const block of event.message.content) {
          if (block.type === "text" && block.text) {
            await onEvent({
              type: "assistant_delta",
              text: block.text,
              runtime: "cursor",
              metadata: { providerEventType: event.type },
            });
          }
        }
      }
    }

    throwIfAborted(signal);

    return await run.wait();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    if (error instanceof CursorAgentError) {
      throw new Error(`Cursor SDK startup failed: ${error.message}`, { cause: error });
    }

    throw error;
  } finally {
    if (agent) {
      await agent[Symbol.asyncDispose]();
    }
  }
}

export async function runCursorAgentText({ project, apiKey, modelId, prompt, onEvent, signal }) {
  let text = "";

  await runCursorAgent({
    project,
    apiKey,
    modelId,
    prompt,
    signal,
    onEvent: async (event) => {
      if (event.type === "assistant_delta" && event.text) {
        text += event.text;
      }

      if (onEvent) {
        await onEvent(event);
      }
    },
  });

  return text.trim();
}
