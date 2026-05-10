import YAML from "yaml";

export type DesignMarkdownSection = {
  title: string;
  content: string;
};

export type DesignIdentityDraft = {
  frontmatter: Record<string, unknown>;
  opening: string;
  sections: DesignMarkdownSection[];
  parseError: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function parseDesignMarkdownSections(body: string) {
  const sections: DesignMarkdownSection[] = [];
  const headingPattern = /^##\s+(.+)$/gm;
  let openingEnd = 0;
  let previousMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(body)) !== null) {
    if (!previousMatch) {
      openingEnd = match.index;
    } else {
      sections.push({
        title: previousMatch[1].trim(),
        content: body.slice(previousMatch.index + previousMatch[0].length, match.index).replace(/^\n+/, "").replace(/\n+$/, ""),
      });
    }

    previousMatch = match;
  }

  if (previousMatch) {
    sections.push({
      title: previousMatch[1].trim(),
      content: body.slice(previousMatch.index + previousMatch[0].length).replace(/^\n+/, "").replace(/\n+$/, ""),
    });
  }

  return {
    opening: previousMatch ? body.slice(0, openingEnd).replace(/\n+$/, "") : body.replace(/\n+$/, ""),
    sections,
  };
}

export function parseDesignIdentityDraft(markdown: string): DesignIdentityDraft {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const rawFrontmatter = match?.[1] ?? "";
  const rawBody = match?.[2] ?? markdown;
  const parsedBody = parseDesignMarkdownSections(rawBody);

  try {
    const frontmatter = YAML.parse(rawFrontmatter) ?? {};

    return {
      frontmatter: asRecord(frontmatter),
      opening: parsedBody.opening,
      sections: parsedBody.sections,
      parseError: null,
    };
  } catch (error) {
    return {
      frontmatter: {},
      opening: rawBody,
      sections: [],
      parseError: error instanceof Error ? error.message : "Could not parse design identity frontmatter.",
    };
  }
}

function serializeDesignMarkdownBody(opening: string, sections: DesignMarkdownSection[]) {
  const chunks: string[] = [];

  if (opening.trim()) {
    chunks.push(opening.trimEnd());
  }

  chunks.push(
    ...sections.map((section) => {
      const content = section.content.trimEnd();
      return content ? `## ${section.title}\n\n${content}` : `## ${section.title}`;
    }),
  );

  return chunks.join("\n\n");
}

export function serializeDesignIdentityDraft(draft: DesignIdentityDraft) {
  const frontmatter = YAML.stringify(draft.frontmatter).trimEnd();
  const body = serializeDesignMarkdownBody(draft.opening, draft.sections);

  return `---\n${frontmatter}\n---\n${body ? `\n${body}\n` : ""}`;
}
