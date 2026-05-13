export function normalizeGitDiffTextResult(value) {
  if (value && typeof value === "object") {
    return {
      diff: typeof value.diff === "string" ? value.diff : "",
      ...(typeof value.diffError === "string" && value.diffError ? { diffError: value.diffError } : {}),
    };
  }

  return { diff: typeof value === "string" ? value : "" };
}

export async function buildGitDiffPromptEntries({ projectRoot, files, gitFileDiffText, gitFileDiffTexts = null, trimForPrompt }) {
  const uniqueFiles = [...new Map(files.filter((file) => file?.path).map((file) => [file.path, file])).values()];
  const byPath = gitFileDiffTexts
    ? new Map((await gitFileDiffTexts(projectRoot, uniqueFiles.map((file) => file.path))).map((entry) => [entry.path, entry]))
    : null;

  return await Promise.all(
    uniqueFiles.map(async (file) => {
      const result = normalizeGitDiffTextResult(byPath?.get(file.path) ?? (await gitFileDiffText(projectRoot, file.path)));
      return {
        path: file.path,
        ...(file.kind ? { kind: file.kind } : {}),
        diff: trimForPrompt(result.diff),
        ...(result.diffError ? { diffError: result.diffError } : {}),
      };
    }),
  );
}
