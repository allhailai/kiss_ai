import { useCallback, useEffect, useMemo, useState } from "react";
import type { RequirementsSyncConceptualDiff, RequirementsSyncProposal, RequirementsSyncSignalsResponse, RequirementsSyncStep } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { errorMessage } from "../../domain/errors";

type RequirementsSyncControllerOptions = {
  projectSlug: string | null;
  selectedModelId: string;
  onApplied: () => Promise<void> | void;
  onNotice: (message: string) => void;
};

export function useRequirementsSync({ projectSlug, selectedModelId, onApplied, onNotice }: RequirementsSyncControllerOptions) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<RequirementsSyncStep>("goal");
  const [proposals, setProposals] = useState<Partial<Record<RequirementsSyncStep, RequirementsSyncProposal>>>({});
  const [signals, setSignals] = useState<RequirementsSyncSignalsResponse | null>(null);
  const [loadingStep, setLoadingStep] = useState<RequirementsSyncStep | null>(null);
  const [applying, setApplying] = useState(false);

  const currentProposal = proposals[step] ?? null;
  const busy = Boolean(loadingStep || applying);

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

  const proposeStep = useCallback(
    async (targetStep: RequirementsSyncStep = step) => {
      if (!projectSlug || !selectedModelId || busy) return false;
      setLoadingStep(targetStep);
      onNotice("");
      try {
        const response = await api.proposeRequirementsSync(projectSlug, {
          modelId: selectedModelId,
          step: targetStep,
        });
        setProposals((current) => ({ ...current, [targetStep]: response.proposal }));
        return true;
      } catch (error) {
        onNotice(errorMessage(error, "Could not generate the requirements sync proposal."));
        return false;
      } finally {
        setLoadingStep(null);
      }
    },
    [busy, onNotice, projectSlug, selectedModelId, step],
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

  return useMemo(
    () => ({
      applyProposal,
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
      updateDiffStatus,
    }),
    [
      applyProposal,
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
      updateDiffStatus,
    ],
  );
}
