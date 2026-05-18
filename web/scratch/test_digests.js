// Quick smoke test: run digest generation against an existing project
// and show coverage distribution + sample outputs
import { generateSourceDigests } from "../server/services/webResearch.js";
import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_PATH = "/opt/all_hail_ai/kiss_ai_projects/economics_and_equity_markets";

console.log("Running digest generation against:", PROJECT_PATH);
console.log("---");

const results = await generateSourceDigests(PROJECT_PATH, (progress) => {
  if (progress.completed % 10 === 0) {
    process.stdout.write(`  ${progress.completed}/${progress.total}\r`);
  }
});

console.log("\n=== Results ===");
console.log(`Generated: ${results.generated}`);
console.log(`Skipped (cached): ${results.skipped}`);
console.log(`Total: ${results.total}`);

// Read the generated digests and show coverage distribution
const digestsDir = path.join(PROJECT_PATH, "sources", "digests");
const files = await fs.readdir(digestsDir);
const mdFiles = files.filter((f) => f.endsWith(".md"));

let high = 0, medium = 0, low = 0, none = 0;
const samples = { high: null, medium: null, low: null };

for (const file of mdFiles) {
  const content = await fs.readFile(path.join(digestsDir, file), "utf-8");
  
  if (content.includes("coverage: **high**")) {
    high++;
    if (!samples.high) samples.high = { file, content };
  } else if (content.includes("coverage: **medium**")) {
    medium++;
    if (!samples.medium) samples.medium = { file, content };
  } else if (content.includes("coverage: **low**")) {
    low++;
    if (!samples.low) samples.low = { file, content };
  } else {
    none++; // Fetch failed digests don't have coverage
  }
}

console.log("\n=== Coverage Distribution ===");
console.log(`  High:   ${high} (${Math.round(high/mdFiles.length*100)}%)`);
console.log(`  Medium: ${medium} (${Math.round(medium/mdFiles.length*100)}%)`);
console.log(`  Low:    ${low} (${Math.round(low/mdFiles.length*100)}%)`);
console.log(`  N/A:    ${none} (fetch failures)`);

// Show one sample of each coverage level
for (const [level, sample] of Object.entries(samples)) {
  if (sample) {
    console.log(`\n=== Sample ${level.toUpperCase()} coverage: ${sample.file} ===`);
    // Show first 20 lines
    const lines = sample.content.split("\n").slice(0, 25);
    console.log(lines.join("\n"));
    console.log("...");
  }
}
