import React from "react";
import ReactDOM from "react-dom/client";
import { AppWithAuth } from "./app/App";
import "./styles.css";
import "./editor/MarkdownEditor.css";
import "./editor/annotationExtension.css";
import "./editor/markdownTableExtension.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppWithAuth />
  </React.StrictMode>,
);
