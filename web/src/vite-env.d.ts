/// <reference types="vite/client" />

// Ambient module declarations for mermaid (loaded from CDN at runtime)
declare module "mermaid" {
  interface MermaidAPI {
    initialize(config: Record<string, unknown>): void;
    render(id: string, source: string): Promise<{ svg: string }>;
  }
  const mermaid: MermaidAPI;
  export default mermaid;
}

declare module "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs" {
  import mermaid from "mermaid";
  export default mermaid;
}
