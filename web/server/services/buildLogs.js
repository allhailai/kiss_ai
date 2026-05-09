import fs from "node:fs/promises";
import path from "node:path";

export function createBuildLogService({
  buildLogDefinitions,
  buildLogDefinitionById,
  humanizePathSegment,
  projectPath,
  readTextFile,
}) {
  function markdownHeadingTitle(markdown, fallback) {
    const heading = markdown.match(/^#\s+(.+)$/m) ?? markdown.match(/^##\s+(.+)$/m);
    return heading?.[1]?.trim() || fallback;
  }

  function markdownSectionId(title, index) {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

    return `section-${index + 1}${slug ? `-${slug}` : ""}`;
  }

  function parseMarkdownSections(markdown) {
    const matches = [...markdown.matchAll(/^##\s+(.+)$/gm)];

    return matches.map((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? markdown.length;
      const title = match[1].trim();

      return {
        id: markdownSectionId(title, index),
        title,
        content: markdown.slice(start, end).trim(),
      };
    });
  }

  function buildLogFileOption({ path, name, title, modifiedAt, sections = [] }) {
    return {
      path,
      name,
      title,
      modifiedAt,
      sections: sections.map(({ id, title }) => ({ id, title })),
    };
  }

  function buildLogContentItem(file, sectionId = null) {
    const section = sectionId ? file.sections.find((candidate) => candidate.id === sectionId) : null;

    return {
      ...buildLogFileOption(file),
      selectedSectionId: section?.id ?? null,
      content: section?.content ?? file.content,
      title: section?.title ?? file.title,
    };
  }

  async function readBuildLogFile(projectRoot, relativePath, fallbackTitle) {
    const file = await readTextFile(projectRoot, relativePath);
    const { absolute } = projectPath(projectRoot, file.path);
    const stat = await fs.stat(absolute);
    const name = path.basename(file.path);
    const sections = parseMarkdownSections(file.content);

    return {
      path: file.path,
      name,
      title: markdownHeadingTitle(file.content, fallbackTitle ?? humanizePathSegment(name)),
      modifiedAt: stat.mtime.toISOString(),
      sections,
      content: file.content,
    };
  }

  async function listCanonicalBuildLogFile(projectRoot, definition) {
    try {
      return [await readBuildLogFile(projectRoot, definition.path, definition.label)];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function listBuildSummaries(projectRoot) {
    const root = projectPath(projectRoot, "change_logs/summaries");
    let entries = [];

    try {
      entries = await fs.readdir(root.absolute, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return [];
    }

    const summaries = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

      const relativePath = `change_logs/summaries/${entry.name}`;
      const file = await readTextFile(projectRoot, relativePath);
      const { absolute } = projectPath(projectRoot, file.path);
      const stat = await fs.stat(absolute);
      const sections = parseMarkdownSections(file.content);

      summaries.push({
        path: file.path,
        name: entry.name,
        title: markdownHeadingTitle(file.content, humanizePathSegment(entry.name)),
        modifiedAt: stat.mtime.toISOString(),
        sections,
        content: file.content,
      });
    }

    return summaries.sort((left, right) => {
      const nameOrder = right.name.localeCompare(left.name);
      if (nameOrder !== 0) return nameOrder;
      return right.modifiedAt.localeCompare(left.modifiedAt);
    });
  }

  async function listBuildLogFiles(projectRoot, definition) {
    if (definition.kind === "summary") return listBuildSummaries(projectRoot);
    return listCanonicalBuildLogFile(projectRoot, definition);
  }

  async function buildLogTabItem(projectRoot, definition, requestedPath, requestedSectionId) {
    const files = await listBuildLogFiles(projectRoot, definition);
    const selectedFile = (requestedPath ? files.find((file) => file.path === requestedPath) : null) ?? files[0] ?? null;

    return {
      id: definition.id,
      label: definition.label,
      emptyMessage: definition.emptyMessage,
      files: files.map(buildLogFileOption),
      selectedFile: selectedFile ? buildLogContentItem(selectedFile, requestedSectionId) : null,
    };
  }

  async function buildLogTabState(projectRoot, requestedTabId = "", requestedPath = "", requestedSectionId = "") {
    const activeDefinition = buildLogDefinitionById.get(requestedTabId) ?? buildLogDefinitions[0];
    const tabs = await Promise.all(
      buildLogDefinitions.map((definition) =>
        buildLogTabItem(
          projectRoot,
          definition,
          definition.id === activeDefinition.id ? requestedPath : "",
          definition.id === activeDefinition.id ? requestedSectionId : "",
        ),
      ),
    );

    return {
      activeTabId: activeDefinition.id,
      selectedLog: tabs.find((tab) => tab.id === activeDefinition.id)?.selectedFile ?? null,
      tabs,
    };
  }

  return { buildLogTabState };
}
