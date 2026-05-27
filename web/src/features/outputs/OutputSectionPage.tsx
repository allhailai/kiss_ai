import type { ProjectFile, RebuildModel } from "../../contracts/api";
import { OutputSection } from "./OutputSection";

export function OutputSectionPage({
  models,
  projectFiles,
  projectSlug,
  selectedModelId,
  type,
}: {
  models: RebuildModel[];
  projectFiles: ProjectFile[];
  projectSlug: string;
  selectedModelId: string;
  type: "report" | "artifact";
}) {
  return (
    <OutputSection
      models={models}
      projectFiles={projectFiles}
      projectSlug={projectSlug}
      selectedModelId={selectedModelId}
      type={type}
    />
  );
}
