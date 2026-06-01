import { describe, expect, it } from "vitest";
import { buildRouteHash, parseRouteHash } from "./routes";

describe("route hash contract", () => {
  it("builds persisted project route hashes accepted by the server schema", () => {
    const examples = [
      {
        hash: "#/p/demo_project/ai",
        input: ["demo_project", "ai"] as const,
      },
      {
        hash: "#/p/demo-project/outputs/outputs_ai%2Fwiki%2FMarket%20notes.md",
        input: ["demo-project", "outputs", "outputs_ai/wiki/Market notes.md"] as const,
      },
      {
        context: { panel: "build-project" },
        hash: "#/p/demo_project/requirements/human_goal_requirements.md?panel=build-project",
        input: ["demo_project", "requirements", "human_goal_requirements.md"] as const,
      },
    ];

    for (const example of examples) {
      const [projectSlug, view, filePath] = example.input;
      const hash = buildRouteHash(projectSlug, view, filePath, example.context);
      expect(hash).toBe(example.hash);
      expect(parseRouteHash(hash)).toMatchObject({ filePath: filePath ?? null, projectSlug, view });
    }
  });

  it("redirects legacy chat URLs to the ai view with conversations tab", () => {
    const result = parseRouteHash("#/p/demo_project/chat");
    expect(result).toMatchObject({ projectSlug: "demo_project", view: "ai", context: { tab: "conversations" } });
  });

  it("redirects legacy review URLs to the ai view with conversations tab", () => {
    const result = parseRouteHash("#/p/demo_project/review");
    expect(result).toMatchObject({ projectSlug: "demo_project", view: "ai", context: { tab: "conversations" } });
  });

  it("redirects legacy questions URLs to the ai view with questions tab", () => {
    const result = parseRouteHash("#/p/demo_project/questions");
    expect(result).toMatchObject({ projectSlug: "demo_project", view: "ai", context: { tab: "questions" } });
  });

  it("redirects legacy topics URLs to the ai view with topics tab", () => {
    const result = parseRouteHash("#/p/demo_project/topics");
    expect(result).toMatchObject({ projectSlug: "demo_project", view: "ai", context: { tab: "topics" } });
  });
});

