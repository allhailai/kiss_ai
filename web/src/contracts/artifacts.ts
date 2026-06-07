export type ArtifactSpec = {
  slug: string;
  name: string;
  format: string;
  lifecycle: string;
  modelId: string | null;
  sources: string[];
  outputFile: string | null;
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
  hidden?: boolean;
};

export type ArtifactSectionsResponse = {
  sections: ArtifactSection[];
  regeneratedSections: string[];
  regenerationCount: number;
  contractVersion: number | null;
  hiddenSectionIds: string[];
};

export type BuildVersion = {
  version: number;
  timestamp: string;
  dirName: string;
  sizeBytes: number;
};

export type ElementContext = {
  elementTag: string;
  elementId?: string;
  cssPath?: string;
  elementText?: string;
  elementHTML?: string;
};

export type Annotation = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  instruction: string;
  elementContext?: ElementContext | null;
  status: "pending" | "applied" | "failed";
  previouslyApplied?: boolean;
  type?: "add_section";
  afterSectionId?: string | null;
  createdAt: string;
  updatedAt: string;
};
