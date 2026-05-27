import type {
  CreateHumanInputFolderRequest,
  CreateHumanInputFolderResponse,
  CreateHumanInputTextFileRequest,
  CreateHumanInputTextFileResponse,
  DeleteHumanInputFolderRequest,
  DeleteHumanInputFolderResponse,
  DeleteHumanInputResponse,
  FileContent,
  FileDiff,
  FileSearchResponse,
  MoveHumanInputFileRequest,
  MoveHumanInputFileResponse,
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
  createHumanInputTextFile: (projectSlug: string, name: string, content?: string, folder?: string) =>
    request<CreateHumanInputTextFileResponse>(`${projectBase(projectSlug)}/inputs-human/create-text`, {
      method: "POST",
      body: JSON.stringify({ name, content, folder } satisfies CreateHumanInputTextFileRequest),
    }),
  createHumanInputFolder: (projectSlug: string, name: string) =>
    request<CreateHumanInputFolderResponse>(`${projectBase(projectSlug)}/inputs-human/create-folder`, {
      method: "POST",
      body: JSON.stringify({ name } satisfies CreateHumanInputFolderRequest),
    }),
  deleteHumanInputFolder: (projectSlug: string, folder: string) =>
    request<DeleteHumanInputFolderResponse>(`${projectBase(projectSlug)}/inputs-human/folder`, {
      method: "DELETE",
      body: JSON.stringify({ folder } satisfies DeleteHumanInputFolderRequest),
    }),
  moveHumanInputFile: (projectSlug: string, sourcePath: string, targetFolder: string) =>
    request<MoveHumanInputFileResponse>(`${projectBase(projectSlug)}/inputs-human/move`, {
      method: "POST",
      body: JSON.stringify({ sourcePath, targetFolder } satisfies MoveHumanInputFileRequest),
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
  renameOutputFile: (projectSlug: string, fromPath: string, toPath: string) =>
    request<{ oldPath: string; newPath: string }>(`${projectBase(projectSlug)}/file/rename`, {
      method: "POST",
      body: JSON.stringify({ fromPath, toPath }),
    }),
};
