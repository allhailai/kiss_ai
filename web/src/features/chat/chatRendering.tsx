import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export function formatChatDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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
