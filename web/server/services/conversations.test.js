import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createConversationService } from "./conversations.js";
import { httpError } from "./httpErrors.js";

function projectPath(projectRoot, relativePath) {
  const absolute = path.resolve(projectRoot, relativePath);
  if (absolute !== projectRoot && !absolute.startsWith(`${projectRoot}${path.sep}`)) {
    throw httpError("Path escapes the project root.", 403, "path_escape");
  }
  return { absolute, relative: path.relative(projectRoot, absolute).replaceAll(path.sep, "/") };
}

describe("conversation service", () => {
  it("creates, indexes, and normalizes chat-native file context", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-conversations-"));
    const project = { slug: "demo", path: projectRoot };
    const service = createConversationService({ httpError, projectPath });
    const conversation = await service.createConversation(project, { modelId: "model-a" });

    await service.appendMessage(project, conversation.id, {
      role: "user",
      content: "Please update this file.",
      context: {
        currentFile: { path: "human_goal_requirements.md", draftState: "saved" },
        editableFiles: [{ path: "human_goal_requirements.md", contentHash: "abc123", draftState: "saved" }],
        sourceFiles: [{ path: "inputs_human/source.md" }],
      },
    });

    const saved = await service.readConversation(project, conversation.id);
    expect(saved.messages[0].context).toMatchObject({
      currentFile: { path: "human_goal_requirements.md" },
      editableFiles: [{ path: "human_goal_requirements.md", contentHash: "abc123" }],
      sourceFiles: [{ path: "inputs_human/source.md" }],
    });
    await expect(service.listConversations(project)).resolves.toMatchObject({
      conversations: [{ id: conversation.id, messageCount: 1 }],
    });
  });

  it("normalizes legacy chat context aliases to canonical names", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-conversations-"));
    const project = { slug: "demo", path: projectRoot };
    const service = createConversationService({ httpError, projectPath });
    const conversation = await service.createConversation(project, { modelId: "model-a" });

    await service.appendMessage(project, conversation.id, {
      role: "user",
      content: "Please use legacy context.",
      context: {
        activeFiles: [{ path: "human_goal_requirements.md", contentHash: "abc123", draftState: "saved" }],
        fileRefs: [{ path: "inputs_human/source.md" }],
      },
    });

    const saved = await service.readConversation(project, conversation.id);
    expect(saved.messages[0].context).toMatchObject({
      editableFiles: [{ path: "human_goal_requirements.md", contentHash: "abc123" }],
      sourceFiles: [{ path: "inputs_human/source.md" }],
    });
    expect(saved.messages[0].context).not.toHaveProperty("activeFiles");
    expect(saved.messages[0].context).not.toHaveProperty("fileRefs");
  });

  it("serializes overlapping message appends for the same project", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-conversations-"));
    const project = { slug: "demo", path: projectRoot };
    const service = createConversationService({ httpError, projectPath });
    const conversation = await service.createConversation(project, { modelId: "model-a" });

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        service.appendMessage(project, conversation.id, {
          role: "user",
          content: `Message ${index}`,
        }),
      ),
    );

    const saved = await service.readConversation(project, conversation.id);
    expect(saved.messages.map((message) => message.content).sort()).toEqual([
      "Message 0",
      "Message 1",
      "Message 2",
      "Message 3",
      "Message 4",
      "Message 5",
      "Message 6",
      "Message 7",
    ]);
    await expect(service.listConversations(project)).resolves.toMatchObject({
      conversations: [{ id: conversation.id, messageCount: 8 }],
    });
  });
});
