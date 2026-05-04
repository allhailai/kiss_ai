import { Agent, CursorAgentError } from "@cursor/sdk";

export async function runCursorAgent({ project, apiKey, modelId, prompt, onEvent }) {
  let agent;

  try {
    agent = await Agent.create({
      apiKey,
      model: { id: modelId },
      local: { cwd: project.path },
    });

    await onEvent({
      type: "run_status",
      title: "Agent created",
      text: `Agent created: ${agent.agentId ?? "local"}`,
      status: "agent_created",
      runtime: "cursor",
      metadata: { agentId: agent.agentId ?? null },
    });

    const run = await agent.send(prompt);

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

    return await run.wait();
  } catch (error) {
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
