export type TopicState = "seed" | "shallow" | "deep" | "saturated" | "split_candidate" | "deprecated";
export type TopicConfidence = "high" | "low";
export type TopicDisposition = "parked" | "settled" | null;

export type Topic = {
  id: string;
  label: string;
  state: TopicState;
  confidence: TopicConfidence;
  depth: number;
  parent: string | null;
  children: string[];
  cluster: string | null;
  wiki_page: string | null;
  sources: Array<{ path: string; relevance: number; added_at: string }>;
  depends_on: string[];
  outputs: string[];
  justification: {
    goal_support: string;
    graph_support: string;
    questions_addressed: string[];
  } | null;
  discovery: {
    origin: string;
    discovered_at: string;
    discovered_from: string | null;
    reason: string | null;
    last_deepened: string | null;
    deepening_count: number;
  };
  deprecation: {
    reason: string | null;
    deprecated_at: string | null;
    merged_into: string | null;
    notes: string | null;
  } | null;
  metrics: {
    source_count: number;
    cross_references: number;
    word_count: number;
    last_updated: string | null;
  };
  coverage_gaps: Array<string | {
    description: string;
    search_hints?: string[];
    target_urls?: string[];
    reason?: string;
    attempts?: number;
    first_noted?: string;
  }>;
  disposition: TopicDisposition;
  disposition_at: string | null;
  disposition_note: string | null;
  queued_for_deepen: boolean;
  deepen_log: Array<{
    deepened_at: string;
    sources_added: number;
    sources_total?: number;
    unfetched?: string[];
    word_count_before: number;
    word_count_after: number;
    state_before: TopicState;
    state_after: TopicState;
    enriched_files: string[];
    enriched_file_details?: string[];
    seed_topics_added?: number;
    coverage_gaps_remaining?: string[];
  }>;
};

export type TopicDuplicate = {
  id: string;
  label: string;
  state: TopicState;
  disposition: TopicDisposition;
};

export type CreateTopicRequest = {
  label: string;
  justification?: string | null;
  conversationId?: string | null;
  force?: boolean;
};

export type CreateTopicResponse = {
  created: boolean;
  topic: Topic | null;
  duplicates: TopicDuplicate[];
  acknowledgedDuplicates?: boolean;
  error?: string;
};
