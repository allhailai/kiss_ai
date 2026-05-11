import type {
  DeleteHumanInputResponse,
  FileContent,
  FileDiff,
  FileSearchResponse,
  TreeResponse,
  UploadHumanInputsResponse,
  WriteFileRequest,
} from "../contracts/api";
import { projectBase, request } from "./request";

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function searchProjectFiles(projectSlug: string, query: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query });
  return request<FileSearchResponse>(`${projectBase(projectSlug)}/search/files?${params}`, { signal });
}

function filePathQuery(path: string) {
  return new URLSearchParams({ path }).toString();
}

export const filesApi = {
  tree: (projectSlug: string, section: string) => request<TreeResponse>(`${projectBase(projectSlug)}/tree/${section}`),
  uploadHumanInputs: async (projectSlug: string, files: File[]) =>
    request<UploadHumanInputsResponse>(`${projectBase(projectSlug)}/inputs-human/upload`, {
      method: "POST",
      body: JSON.stringify({
        files: await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            contentBase64: await fileToBase64(file),
          })),
        ),
      }),
    }),
  deleteHumanInput: (projectSlug: string, path: string) =>
    request<DeleteHumanInputResponse>(`${projectBase(projectSlug)}/inputs-human/file`, {
      method: "DELETE",
      body: JSON.stringify({ path }),
    }),
  searchFiles: searchProjectFiles,
  file: (projectSlug: string, path: string) => request<FileContent>(`${projectBase(projectSlug)}/file?${filePathQuery(path)}`),
  fileDiff: (projectSlug: string, path: string) => request<FileDiff>(`${projectBase(projectSlug)}/file/diff?${filePathQuery(path)}`),
  saveFile: (projectSlug: string, path: string, content: string, expectedContentHash: string) =>
    request<FileContent>(`${projectBase(projectSlug)}/file`, {
      method: "PUT",
      body: JSON.stringify({ path, content, expectedContentHash } satisfies WriteFileRequest),
    }),
  revertFile: (projectSlug: string, path: string) =>
    request<FileContent>(`${projectBase(projectSlug)}/file/revert`, {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
};
