import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatLocalDateTime } from "../../domain/formatters";

export function formatChatDateTime(value: string | null | undefined) {
  return formatLocalDateTime(value, "Not recorded");
}

const chatMarkdownComponents: Components = {
  a({ children, href, ...props }) {
    return (
      <a href={href} rel="noopener noreferrer" target="_blank" {...props}>
        {children}
      </a>
    );
  },
};

/**
 * Strip structured agent tags (file_edit, artifact_proposal, topic_proposal)
 * and their content from the rendered chat message so raw spec/tag internals
 * don't flood the message bubble.
 */
const AGENT_TAG_PATTERN = /<(?:file_edit|file_rename|artifact_rename|artifact_proposal|topic_proposal)>[\s\S]*?<\/(?:file_edit|file_rename|artifact_rename|artifact_proposal|topic_proposal)>/gi;

function stripAgentTags(content: string): string {
  return content.replace(AGENT_TAG_PATTERN, "").trim();
}

export function renderMarkdownMessageContent(content: string) {
  const cleaned = stripAgentTags(content);
  if (!cleaned.trim()) return <p>No content recorded.</p>;
  return (
    <div className="chat-markdown">
      <ReactMarkdown components={chatMarkdownComponents} remarkPlugins={[remarkGfm]} skipHtml>
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
