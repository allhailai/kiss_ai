import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function gitGrepSearch(projectRoot, tokens) {
  if (tokens.length === 0) return new Set();

  const args = ["grep", "-i", "-I", "-l", "--untracked", "--all-match"];
  for (const token of tokens) {
    args.push("-F", "-e", token);
  }

  try {
    const { stdout } = await execFileAsync("git", args, { cwd: projectRoot, maxBuffer: 1024 * 1024 * 10 });
    const paths = stdout.split("\n").filter(Boolean);
    return new Set(paths);
  } catch (error) {
    console.error("Error running git grep:", error);
    return new Set();
  }
}

gitGrepSearch("/Users/gavindouglas/Documents/kiss_ai_projects/neuroscience_research", ["cognitive"]).then((paths) => {
  console.log("Matched paths:", paths.size);
});
