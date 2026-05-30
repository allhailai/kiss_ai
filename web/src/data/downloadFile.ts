import { projectBase } from "./request";

/**
 * Trigger a browser file-save dialog for a project file.
 *
 * Fetches the file from the download API route and creates a temporary
 * object URL to initiate the download with the correct filename.
 */
export function downloadProjectFile(projectSlug: string, filePath: string): void {
  const basename = filePath.split("/").pop() || "download.txt";
  const url = `${projectBase(projectSlug)}/file/download?path=${encodeURIComponent(filePath)}`;
  triggerDownload(url, basename);
}

/**
 * Trigger a browser file-save dialog for any URL.
 * Uses a temporary `<a download>` element.
 */
export function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
