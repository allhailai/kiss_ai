import type { ProjectFile } from "../contracts/api";

export type FileTreeNode =
  | {
      type: "directory";
      key: string;
      name: string;
      fullPath: string;
      children: FileTreeNode[];
    }
  | {
      type: "file";
      key: string;
      name: string;
      file: ProjectFile;
    };

function sortTreeNodes(nodes: FileTreeNode[]) {
  nodes.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

  for (const node of nodes) {
    if (node.type === "directory") {
      sortTreeNodes(node.children);
    }
  }
}

export function buildFileTree(files: ProjectFile[], emptyDirectories?: Array<{ path: string; name: string }>) {
  const root: FileTreeNode[] = [];

  for (const file of files) {
    const segments = file.name.split("/").filter(Boolean);
    const pathSegments = file.path.split("/").filter(Boolean);
    const rootPathSegments = pathSegments.slice(0, Math.max(0, pathSegments.length - segments.length));
    const fileName = segments.at(-1) ?? file.name;
    let children = root;
    const directoryParts: string[] = [];

    for (const directoryName of segments.slice(0, -1)) {
      directoryParts.push(directoryName);
      const directoryKey = directoryParts.join("/");
      const fullPath = [...rootPathSegments, ...directoryParts].join("/");
      let directory = children.find(
        (node): node is Extract<FileTreeNode, { type: "directory" }> =>
          node.type === "directory" && node.key === directoryKey,
      );

      if (!directory) {
        directory = {
          type: "directory",
          key: directoryKey,
          name: directoryName,
          fullPath,
          children: [],
        };
        children.push(directory);
      }

      children = directory.children;
    }

    children.push({
      type: "file",
      key: file.path,
      name: fileName,
      file,
    });
  }

  // Inject empty directories so they appear as expandable folder nodes.
  if (emptyDirectories?.length) {
    for (const emptyDir of emptyDirectories) {
      const segments = emptyDir.name.split("/").filter(Boolean);
      const pathSegments = emptyDir.path.split("/").filter(Boolean);
      const rootPathSegments = pathSegments.slice(0, Math.max(0, pathSegments.length - segments.length));
      let children = root;
      const directoryParts: string[] = [];

      for (const directoryName of segments) {
        directoryParts.push(directoryName);
        const directoryKey = directoryParts.join("/");
        const fullPath = [...rootPathSegments, ...directoryParts].join("/");
        let directory = children.find(
          (node): node is Extract<FileTreeNode, { type: "directory" }> =>
            node.type === "directory" && node.key === directoryKey,
        );

        if (!directory) {
          directory = {
            type: "directory",
            key: directoryKey,
            name: directoryName,
            fullPath,
            children: [],
          };
          children.push(directory);
        }

        children = directory.children;
      }
    }
  }

  sortTreeNodes(root);
  return root;
}

export function getAncestorDirectoryKeys(relativePath: string) {
  const segments = relativePath.split("/").filter(Boolean);
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
}

export function uniqueFiles(files: ProjectFile[]) {
  return [...new Map(files.map((file) => [file.path, file])).values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function uniqueByPathPreserveFirst<T extends { path: string }>(files: T[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.path)) return false;
    seen.add(file.path);
    return true;
  });
}

export function fileBasename(path: string) {
  return path.split("/").at(-1) ?? path;
}

export function projectFileDisplayName(file: Pick<ProjectFile, "name" | "path">) {
  return file.name || fileBasename(file.path);
}

export function labeledFileDisplayName(file: { label?: string | null; path: string }) {
  return file.label || file.path;
}

export function humanizePathSegment(pathSegment: string) {
  const withoutExtension = pathSegment.replace(/\.[^.]+$/i, "");
  const spaced = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();

  if (!spaced) return pathSegment;

  return spaced
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower.length <= 3) return lower.toUpperCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

export function humanizeFilePath(path: string) {
  return path.split("/").filter(Boolean).map(humanizePathSegment).join(" / ");
}

const ARTIFACT_SPEC_PATTERN = /^artifacts\/artifact_specs\/(.+)\.artifact\.md$/;

export function parseArtifactSpecPath(path: string): { slug: string; name: string } | null {
  const match = path.match(ARTIFACT_SPEC_PATTERN);
  if (!match?.[1]) return null;
  return { slug: match[1], name: humanizePathSegment(match[1]) };
}
