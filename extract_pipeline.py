import sys

with open("web/server/services/agentJobs.js", "r") as f:
    lines = f.readlines()

knowledge_build_lines = lines[530:1387] # 0-indexed, so 530 is line 531
with open("web/server/services/pipelines/pipelineKnowledgeBuild.js", "w") as f:
    f.write("import path from 'node:path';\n")
    f.write("import { computeBuildScope } from '../buildScope.js';\n")
    f.write("import { getDeepenQueue, readTopics, writeTopics, reconcileTopicSources, computeWikiMetrics, autoAdvanceTopicStates } from '../topicsService.js';\n")
    f.write("import { computeWikiTriage, updateWikiPageTracker, resetWikiPageTracker, regenerateWikiIndex } from '../wikiTriage.js';\n")
    f.write("import { readLedger, buildSnapshot, diffSnapshot, writeLedger, recordKnowledgeBuild } from '../contentLedger.js';\n")
    f.write("import { validateFileExistence, readManifest, writeManifest, prependBuildLogEntry, gitSnapshot, recordBuildFileChanges } from '../serverValidation.js';\n")
    f.write("import { readQuestions } from '../questionsService.js';\n\n")
    f.write("export async function runKnowledgeBuildJob(context) {\n")
    f.write("  const { project, apiKey, modelId, prompt, jobName, runKind, releaseProjectAgent, signal, activeRebuilds, buildStartTime, phaseTimings, appendRunEvent, getRebuildState, setRebuildState, runSingleAgentPhase, runFetchPhase, runDigestPhase, runWikiPagePhase, createAgentJobCompletionMessage, finishAssistantMessage, MAX_WIKI_CONCURRENCY, createAutoAnswerPrompt, createWikiOnlyPrompt, activeAbortControllers } = context;\n\n")
    
    # Strip out the first few lines of runAgentJob because we pass in context now
    # We will just write from line 546 (index 545) which is "const isFullRebuild = runKind === \"full_rebuild\";"
    for line in lines[546:1387]:
        f.write(line)
