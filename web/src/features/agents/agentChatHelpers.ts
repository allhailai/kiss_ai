import type { Conversation, EditProposal } from "../../contracts/api";

export function latestAttentionEditProposal(conversation: Conversation | null): EditProposal | null {
  return [...(conversation?.editProposals ?? [])].reverse().find((proposal) => proposal.status !== "applied") ?? null;
}

export function proposalDiffGroups(proposal: EditProposal) {
  const groups = new Map<string, typeof proposal.conceptualDiffs>();
  proposal.conceptualDiffs.forEach((diff) => {
    const list = groups.get(diff.filePath) ?? [];
    list.push(diff);
    groups.set(diff.filePath, list);
  });
  return [...groups.entries()].map(([filePath, conceptualDiffs]) => ({ filePath, conceptualDiffs }));
}

export function proposalStatusLabel(status: EditProposal["status"]) {
  switch (status) {
    case "applied":
      return "Applied";
    case "applying":
      return "Applying";
    case "failed":
      return "Needs review";
    case "partial":
      return "Partially applied";
    case "proposed":
      return "Ready to review";
  }
}

export function canApplyProposal(proposal: EditProposal) {
  return ["proposed", "partial", "failed"].includes(proposal.status) && proposal.conceptualDiffs.some((diff) => diff.status === "accepted");
}
