import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RequirementsSyncBatchApplyResult,
  RequirementsSyncConceptualDiff,
  RequirementsSyncProposal,
  RequirementsSyncSignalsResponse,
  RequirementsSyncStep,
} from "../../contracts/api";
import { api } from "../../data/apiClient";
import { errorMessage } from "../../domain/errors";
import { requirementsSyncSteps, type RequirementsSyncStepStatus } from "../../domain/requirementsSync";

type RequirementsSyncControllerOptions = {
  projectSlug: string | null;
  selectedModelId: string;
  onApplied: () => Promise<void> | void;
  onNotice: (message: string) => void;
};

function initialStepStatuses(): Record<RequirementsSyncStep, RequirementsSyncStepStatus> {
  return {
    goal: "idle",
    inputs: "idle",
    outputs: "idle",
  };
}

function orderedProposals(proposals: Partial<Record<RequirementsSyncStep, RequirementsSyncProposal>>) {
  return requirementsSyncSteps.map((candidate) => proposals[candidate.id]).filter((proposal): proposal is RequirementsSyncProposal => Boolean(proposal));
}

export function useRequirementsSync({ projectSlug, selectedModelId, onApplied, onNotice }: RequirementsSyncControllerOptions) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<RequirementsSyncStep>("goal");
  const [proposals, setProposals] = useState<Partial<Record<RequirementsSyncStep, RequirementsSyncProposal>>>({});
  const [signals, setSignals] = useState<RequirementsSyncSignalsResponse | null>(null);
  const [stepStatuses, setStepStatuses] = useState<Record<RequirementsSyncStep, RequirementsSyncStepStatus>>(initialStepStatuses);
  const [applyResults, setApplyResults] = useState<Partial<Record<RequirementsSyncStep, RequirementsSyncBatchApplyResult>>>({});
  const [loadingStep, setLoadingStep] = useState<RequirementsSyncStep | null>(null);
  const [applying, setApplying] = useState(false);

  const currentProposal = proposals[step] ?? null;
  const busy = Boolean(loadingStep || applying);
  const allProposals = orderedProposals(proposals);
  const allProposalsReady = requirementsSyncSteps.every((candidate) => Boolean(proposals[candidate.id]));
  const acceptedDiffCount = allProposals.reduce((count, proposal) => count + proposal.conceptualDiffs.filter((diff) => diff.status === "accepted").length, 0);
  const totalDiffCount = allProposals.reduce((count, proposal) => count + proposal.conceptualDiffs.length, 0);

  const refreshSignals = useCallback(async () => {
    if (!projectSlug) return null;
    try {
      const nextSignals = await api.requirementsSyncSignals(projectSlug);
      setSignals(nextSignals);
      return nextSignals;
    } catch (error) {
      onNotice(errorMessage(error, "Could not load requirements sync signals."));
      return null;
    }
  }, [onNotice, projectSlug]);

  useEffect(() => {
    setStep("goal");
    setProposals({});
    setStepStatuses(initialStepStatuses());
    setApplyResults({});
    setSignals(null);
    if (projectSlug) void refreshSignals();
  }, [projectSlug, refreshSignals]);

  const showController = useCallback(() => {
    setOpen(true);
    void refreshSignals();
  }, [refreshSignals]);

  const recordProposalReview = useCallback(
    (proposal: RequirementsSyncProposal) => {
      if (!projectSlug) return;
      void api.reviewRequirementsSync(projectSlug, { proposal }).catch((error) => {
        onNotice(errorMessage(error, "Could not remember requirements sync review."));
      });
    },
    [onNotice, projectSlug],
  );

  const setStepStatus = useCallback((targetStep: RequirementsSyncStep, status: RequirementsSyncStepStatus) => {
    setStepStatuses((current) => ({ ...current, [targetStep]: status }));
  }, []);

  const generateProposal = useCallback(
    async (targetStep: RequirementsSyncStep) => {
      if (!projectSlug || !selectedModelId) return false;
      setLoadingStep(targetStep);
      setStepStatus(targetStep, "generating");
      onNotice("");
      try {
        const response = await api.proposeRequirementsSync(projectSlug, {
          modelId: selectedModelId,
          step: targetStep,
        });
        setProposals((current) => ({ ...current, [targetStep]: response.proposal }));
        setStepStatus(targetStep, "ready");
        return true;
      } catch (error) {
        setStepStatus(targetStep, "error");
        onNotice(errorMessage(error, "Could not generate the requirements sync proposal."));
        return false;
      } finally {
        setLoadingStep(null);
      }
    },
    [onNotice, projectSlug, selectedModelId, setStepStatus],
  );

  const proposeStep = useCallback(
    async (targetStep: RequirementsSyncStep = step) => {
      if (busy) return false;
      return generateProposal(targetStep);
    },
    [busy, generateProposal, step],
  );

  const syncAll = useCallback(
    async () => {
      if (!projectSlug || !selectedModelId || busy) return false;
      setOpen(true);
      setProposals({});
      setApplyResults({});
      setStepStatuses(initialStepStatuses());

      let generatedAll = true;
      for (const candidate of requirementsSyncSteps) {
        setStep(candidate.id);
        const generated = await generateProposal(candidate.id);
        generatedAll = generatedAll && generated;
      }

      if (generatedAll) {
        onNotice("Requirements Sync proposals are ready for review.");
      }
      return generatedAll;
    },
    [busy, generateProposal, onNotice, projectSlug, selectedModelId],
  );

  const updateDiffStatus = useCallback(
    (targetStep: RequirementsSyncStep, diffId: string, status: RequirementsSyncConceptualDiff["status"]) => {
      const proposal = proposals[targetStep];
      if (!proposal) return;
      const nextProposal = {
        ...proposal,
        conceptualDiffs: proposal.conceptualDiffs.map((diff) => (diff.id === diffId ? { ...diff, status } : diff)),
      };
      setProposals((current) => ({ ...current, [targetStep]: nextProposal }));
      recordProposalReview(nextProposal);
    },
    [proposals, recordProposalReview],
  );

  const setAllDiffs = useCallback(
    (targetStep: RequirementsSyncStep, status: RequirementsSyncConceptualDiff["status"]) => {
      const proposal = proposals[targetStep];
      if (!proposal) return;
      const nextProposal = {
        ...proposal,
        conceptualDiffs: proposal.conceptualDiffs.map((diff) => ({ ...diff, status })),
      };
      setProposals((current) => ({ ...current, [targetStep]: nextProposal }));
      recordProposalReview(nextProposal);
    },
    [proposals, recordProposalReview],
  );

  const applyProposal = useCallback(
    async (proposal: RequirementsSyncProposal | null = currentProposal) => {
      if (!projectSlug || !proposal || applying) return false;
      const acceptedDiffs = proposal.conceptualDiffs.filter((diff) => diff.status === "accepted");
      if (proposal.conceptualDiffs.length && !acceptedDiffs.length) {
        onNotice("Accept at least one conceptual change before applying, or skip this step.");
        return false;
      }

      setApplying(true);
      onNotice("");
      try {
        await api.applyRequirementsSync(projectSlug, {
          modelId: selectedModelId,
          proposal,
        });
        await onApplied();
        await refreshSignals();
        onNotice(`Applied ${proposal.targetFilePath}.`);
        return true;
      } catch (error) {
        onNotice(errorMessage(error, "Could not apply the requirements sync proposal."));
        return false;
      } finally {
        setApplying(false);
      }
    },
    [applying, currentProposal, onApplied, onNotice, projectSlug, refreshSignals, selectedModelId],
  );

  const applyAll = useCallback(
    async () => {
      if (!projectSlug || applying) return false;
      const proposalsToApply = requirementsSyncSteps.map((candidate) => proposals[candidate.id]);
      if (proposalsToApply.some((proposal) => !proposal)) {
        onNotice("Generate all Requirements Sync proposals before applying.");
        return false;
      }
      const completeProposals = proposalsToApply.filter((proposal): proposal is RequirementsSyncProposal => Boolean(proposal));
      const acceptedDiffs = completeProposals.flatMap((proposal) => proposal.conceptualDiffs.filter((diff) => diff.status === "accepted"));
      if (!acceptedDiffs.length) {
        onNotice("Accept at least one conceptual change before applying Requirements Sync.");
        return false;
      }

      setApplying(true);
      setApplyResults({});
      setStepStatuses((current) => {
        const next = { ...current };
        for (const proposal of completeProposals) {
          next[proposal.step] = "applying";
        }
        return next;
      });
      onNotice("");
      try {
        const response = await api.applyRequirementsSyncBatch(projectSlug, {
          modelId: selectedModelId,
          proposals: completeProposals,
        });
        const nextResults: Partial<Record<RequirementsSyncStep, RequirementsSyncBatchApplyResult>> = {};
        setStepStatuses((current) => {
          const next = { ...current };
          for (const result of response.results) {
            nextResults[result.step] = result;
            next[result.step] = result.status;
          }
          return next;
        });
        setApplyResults(nextResults);
        await onApplied();
        await refreshSignals();
        onNotice(response.summary);
        return response.results.every((result) => result.status !== "failed");
      } catch (error) {
        setStepStatuses((current) => {
          const next = { ...current };
          for (const proposal of completeProposals) {
            next[proposal.step] = "failed";
          }
          return next;
        });
        onNotice(errorMessage(error, "Could not apply the Requirements Sync proposals."));
        return false;
      } finally {
        setApplying(false);
      }
    },
    [applying, onApplied, onNotice, projectSlug, proposals, refreshSignals, selectedModelId],
  );

  return useMemo(
    () => ({
      acceptedDiffCount,
      allProposalsReady,
      allProposals,
      applyAll,
      applyProposal,
      applyResults,
      applying,
      busy,
      currentProposal,
      loadingStep,
      open,
      proposeStep,
      proposals,
      refreshSignals,
      setAllDiffs,
      setStep,
      showController,
      signals,
      step,
      stepStatuses,
      syncAll,
      totalDiffCount,
      updateDiffStatus,
    }),
    [
      acceptedDiffCount,
      allProposalsReady,
      allProposals,
      applyAll,
      applyProposal,
      applyResults,
      applying,
      busy,
      currentProposal,
      loadingStep,
      open,
      proposeStep,
      proposals,
      refreshSignals,
      setAllDiffs,
      showController,
      signals,
      step,
      stepStatuses,
      syncAll,
      totalDiffCount,
      updateDiffStatus,
    ],
  );
}
