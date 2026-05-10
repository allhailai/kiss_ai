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

export function renderMessageContent(content: string) {
  if (!content.trim()) return <p>No content recorded.</p>;
  return (
    <div className="chat-markdown">
      <ReactMarkdown components={chatMarkdownComponents} remarkPlugins={[remarkGfm]} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
