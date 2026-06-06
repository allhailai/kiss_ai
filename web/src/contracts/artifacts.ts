export type ArtifactSpec = {
  slug: string;
  name: string;
  format: string;
  lifecycle: string;
  modelId: string | null;
  sources: string[];
  lastBuilt: string | null;
  status: string;
  buildSpecHash: string | null;
  currentSpecHash: string | null;
  sourcesUpdatedSinceLastBuild: boolean;
};

export type ArtifactSpecDetail = {
  slug: string;
  frontmatter: Record<string, unknown>;
  body: string;
  rawContent: string;
};

export type AvailableSourceFile = {
  relativePath: string;
  kind: string;
  name: string;
};

export type ArtifactSection = {
  id: string;
  title: string;
};

export type ArtifactSectionsResponse = {
  sections: ArtifactSection[];
  regeneratedSections: string[];
  regenerationCount: number;
  contractVersion: number | null;
};

export type ElementContext = {
  elementTag: string;
  elementId?: string;
  cssPath?: string;
  elementText?: string;
  elementHTML?: string;
};
