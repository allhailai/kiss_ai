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

    let outputBytes = 0;

    if (run.supports("stream")) {
      for await (const event of run.stream()) {
        throwIfAborted(signal);

        if (event.type !== "assistant") continue;

        for (const block of event.message.content) {
          if (block.type === "text" && block.text) {
            outputBytes += Buffer.byteLength(block.text, "utf8");
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

    const promptBytes = Buffer.byteLength(prompt, "utf8");
    await onEvent({
      type: "run_usage",
      title: "Agent Run Usage",
      text: `Est. input tokens: ~${Math.round(promptBytes / 4).toLocaleString()}, Est. output tokens: ~${Math.round(outputBytes / 4).toLocaleString()}`,
      status: "finished",
      runtime: "cursor",
      metadata: { promptBytes, outputBytes },
    });

    const result = await run.wait();
    // @ts-expect-error -- custom outputBytes tracking
    result.outputBytes = outputBytes;
    return result;
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

  const result = await runCursorAgent({
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

  const promptBytes = Buffer.byteLength(prompt, "utf8");
  // @ts-expect-error -- custom outputBytes tracking
  const outputBytes = result?.outputBytes ?? 0;
  console.log(`[kiss_ai text] model=${modelId} prompt=~${Math.round(promptBytes / 4)} tokens (${(promptBytes / 1024).toFixed(1)} KB) output=~${Math.round(outputBytes / 4)} tokens (${(outputBytes / 1024).toFixed(1)} KB)`);

  return text.trim();
}
