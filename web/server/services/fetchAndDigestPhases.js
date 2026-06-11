import { parseResearchPlan, executeResearchPlan, generateSourceDigests } from "./webResearch.js";
import { addFailedSources } from "./failedSources.js";

/**
 * Server-side fetch phase: parses the research plan and fetches all URLs.
 * Reports progress via appendRunEvent at 10% intervals.
 *
 * Returns { fetched, failed, skipped, total } or a zero-count fallback on error.
 */
export async function runFetchPhase(projectPath, { appendRunEvent, projectSlug, phaseLabel = "Phase 2" }) {
  try {
    const plan = await parseResearchPlan(projectPath);
    const totalUrls = plan.queries.reduce((sum, q) => sum + q.urls.length, 0);

    await appendRunEvent(projectSlug, {
      type: "system",
      title: `Fetching ${totalUrls} URLs`,
      text: `Research plan contains ${plan.queries.length} topics with ${totalUrls} URLs to fetch.`,
      status: "fetching_sources",
      runtime: "server",
    });

    let lastReportedPercent = -1;
    const failedUrls = [];
    const failedSourcesToPersist = [];

    const fetchResults = await executeResearchPlan(projectPath, plan, async (progress) => {
      if (progress.lastStatus === "failed") {
        failedUrls.push(progress.lastUrl);
        failedSourcesToPersist.push({
          url: progress.lastUrl,
          error: progress.lastError,
        });
      }

      const percent = Math.floor((progress.completed / progress.total) * 10) * 10;
      if (percent <= lastReportedPercent) return;
      lastReportedPercent = percent;

      await appendRunEvent(projectSlug, {
        type: "system",
        title: `Fetching sources... ${progress.completed}/${progress.total} (${percent}%)`,
        text: "Processing research plan URLs.",
        status: "fetching_sources",
        runtime: "server",
      });
    });

    const failedDetail = failedUrls.length > 0
      ? ` Failed: ${failedUrls.map((u) => new URL(u).hostname).join(", ")}`
      : "";

    await appendRunEvent(projectSlug, {
      type: "system",
      title: `Fetch complete: ${fetchResults.fetched} new, ${fetchResults.skipped} cached, ${fetchResults.failed} failed`,
      text: `Server-side fetch finished.${failedDetail}`,
      status: "fetch_complete",
      runtime: "server",
    });

    if (failedUrls.length > 0) {
      await appendRunEvent(projectSlug, {
        type: "system",
        title: `⚠️ Action Required: ${failedUrls.length} fetch failures`,
        text: `The agent failed to fetch or was blocked from the following URLs. Please download them manually and place them in the 'inputs_human/' folder:\n\n${failedUrls.map((u) => `- ${u}`).join("\n")}`,
        status: "fetch_complete",
        runtime: "server",
      });
    }

    if (failedSourcesToPersist.length > 0) {
      await addFailedSources(projectPath, failedSourcesToPersist);
    }

    return {
      ...fetchResults,
      failedUrls,
    };
  } catch (fetchError) {
    const errorMsg = fetchError instanceof Error ? fetchError.message : "Unknown fetch error";
    await appendRunEvent(projectSlug, {
      type: "system",
      title: `${phaseLabel}: Fetch skipped or failed`,
      text: `Server-side fetch could not run: ${errorMsg}. The synthesis agent will proceed with any existing sources.`,
      status: "fetch_skipped",
      runtime: "server",
    });
    return { fetched: 0, failed: 0, skipped: 0, total: 0, failedUrls: [] };
  }
}

/**
 * Server-side digest generation phase: compacts full source articles into
 * key-claim digests for progressive discovery.
 * Reports progress via appendRunEvent at 10% intervals.
 *
 * Non-fatal: logs and returns on error.
 */
export async function runDigestPhase(projectPath, { appendRunEvent, projectSlug }) {
  try {
    let lastDigestPercent = -1;
    let digestGenerated = 0;
    let digestCached = 0;

    const digestResults = await generateSourceDigests(projectPath, async (progress) => {
      if (progress.lastStatus === "generated") digestGenerated++;
      else digestCached++;

      const percent = Math.floor((progress.completed / progress.total) * 10) * 10;
      if (percent <= lastDigestPercent) return;
      lastDigestPercent = percent;

      await appendRunEvent(projectSlug, {
        type: "system",
        title: `Digesting sources... ${progress.completed}/${progress.total} (${digestGenerated} generated, ${digestCached} cached)`,
        text: `Processing source digests (${percent}% complete).`,
        status: "generating_digests",
        runtime: "server",
      });
    });

    await appendRunEvent(projectSlug, {
      type: "system",
      title: `Digests complete: ${digestResults.generated} generated, ${digestResults.skipped} cached`,
      text: `Source digests ready in sources/digests/.`,
      status: "digests_complete",
      runtime: "server",
    });

    return digestResults;
  } catch (digestError) {
    const errorMsg = digestError instanceof Error ? digestError.message : "Unknown digest error";
    await appendRunEvent(projectSlug, {
      type: "system",
      title: "Digest generation skipped",
      text: `Could not generate source digests: ${errorMsg}. The synthesis agent will read full sources.`,
      status: "digests_skipped",
      runtime: "server",
    });
    return { generated: 0, skipped: 0 };
  }
}
