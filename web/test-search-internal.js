import fs from "fs/promises";
import { createProjectFileService } from "./server/services/projectFiles.js";

const svc = createProjectFileService({
  WEB_ROOT: "/Users/gavindouglas/Documents/kiss_ai_projects/_kiss_ai/web",
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
  MAX_SEARCH_RESULTS: 50,
  humanFiles: null,
  hashText: (t) => t,
  humanizePathSegment: (s) => s.replace(/_/g, " "),
  httpError: (msg, code, key) => {
    const err = new Error(msg);
    err.statusCode = code;
    return err;
  }
});

svc.searchFiles("/Users/gavindouglas/Documents/kiss_ai_projects/neuroscience_research", "a", "all").then((files) => {
  console.log("Matched files:", files.length);
  if (files.length === 0) {
    console.log("Candidates check...");
    // Let's call searchFiles with empty query and 'all' filter to see all
    return svc.searchFiles("/Users/gavindouglas/Documents/kiss_ai_projects/neuroscience_research", "", "all");
  }
}).then(files => {
  if (files) console.log("All files count:", files.length);
}).catch(console.error);
