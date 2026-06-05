export async function getProjectStatus({
  project,
  readProjectJson,
  resolveCursorApiKey,
  getHumanAttentionItems,
  getQuestionCounts,
  getTopicCounts,
  gitStatus,
  displayProjectName,
}) {
  // Try v2 manifest first, fall back to v1 harness-state
  const manifest = await readProjectJson(project.path, ".build/manifest.json", null);
  const harness = manifest ? {} : await readProjectJson(project.path, ".harness-state.json", {});
  const cursorApiKey = await resolveCursorApiKey();
  const humanAttentionItems = getHumanAttentionItems(harness);
  const questionCounts = await getQuestionCounts(project.path);
  const topicCounts = await getTopicCounts(project.path);

  return {
    projectSlug: manifest?.project_slug ?? harness.project_slug ?? project.slug,
    projectName: displayProjectName(manifest?.project_name ?? harness.project_name ?? project.name, project.slug),
    setupStatus: manifest ? (manifest.last_build ? "built" : "initialized") : (harness.setup?.status ?? "unknown"),
    setupInitializedAt: manifest?.created_at ?? harness.setup?.initialized_at ?? null,
    lastRunAt: manifest?.last_build?.finished_at ?? harness.last_run_at ?? null,
    lastSuccessfulRunAt: manifest?.last_build?.finished_at ?? harness.last_successful_run_at ?? null,
    scalingMode: harness.scaling_assessment?.selected_mode ?? null,
    rebuildStatus: harness.rebuild_scope?.status ?? null,
    lintStatus: harness.last_lint?.status ?? null,
    unresolvedReviewItems: harness.last_annotation_scan?.unresolved_review_items ?? [],
    blockedArtifacts: harness.rebuild_scope?.blocked_artifacts ?? [],
    staleOutputs: harness.rebuild_scope?.outputs_marked_stale ?? [],
    humanAttentionItems,
    humanAttentionCount: humanAttentionItems.length,
    openQuestionsCount: questionCounts.openQuestionsCount,
    blockingQuestionsCount: questionCounts.blockingQuestionsCount,
    totalQuestionsCount: questionCounts.totalQuestionsCount,

    seedTopicsCount: topicCounts.seedTopicsCount,
    totalTopicsCount: topicCounts.totalTopicsCount,
    parkedTopicsCount: topicCounts.parkedTopicsCount,
    settledTopicsCount: topicCounts.settledTopicsCount,
    cursorApiKeyAvailable: cursorApiKey.available,
    cursorApiKeySource: cursorApiKey.source,
    cursorApiKeyWarnings: cursorApiKey.warnings,
    gitStatus: await gitStatus(project.path),
    // v2 annotation counts from manifest
    annotationCounts: manifest ? {
      feedbackApplied: manifest.feedback_applied ?? 0,
      coverageGapsWritten: manifest.coverage_gaps_written ?? 0,
      autonomousActions: manifest.autonomous_actions ?? 0,
    } : null,
    buildNotes: manifest?.build_notes ?? null,
  };
}
