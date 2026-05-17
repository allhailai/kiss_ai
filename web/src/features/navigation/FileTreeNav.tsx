import { useCallback, useEffect, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import type { ProjectFile } from "../../contracts/api";
import { buildFileTree, getAncestorDirectoryKeys, humanizePathSegment, type FileTreeNode } from "../../domain/files";

export function FileTreeNav({
  files,
  emptyDirectories,
  selectedPath,
  onDeleteFile,
  onMoveFile,
  onSelectFile,
}: {
  files: ProjectFile[];
  emptyDirectories?: string[];
  selectedPath: string | null;
  onDeleteFile?: (path: string) => void;
  onMoveFile?: (sourcePath: string, targetFolder: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const tree = useMemo(() => buildFileTree(files, emptyDirectories), [files, emptyDirectories]);
  const selectedAncestorKeys = useMemo(() => {
    const selectedFile = files.find((file) => file.path === selectedPath);
    return selectedFile ? getAncestorDirectoryKeys(selectedFile.name) : [];
  }, [files, selectedPath]);
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set());
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  useEffect(() => {
    if (selectedAncestorKeys.length === 0) return;

    setExpandedDirectories((current) => {
      const next = new Set(current);
      let changed = false;

      for (const directoryKey of selectedAncestorKeys) {
        if (next.has(directoryKey)) continue;
        next.add(directoryKey);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [selectedAncestorKeys]);

  function toggleDirectory(directoryKey: string) {
    setExpandedDirectories((current) => {
      const next = new Set(current);

      if (next.has(directoryKey)) {
        next.delete(directoryKey);
      } else {
        next.add(directoryKey);
      }

      return next;
    });
  }

  const handleDragOver = useCallback((event: DragEvent, target: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverTarget(target);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverTarget(null);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent, targetFolder: string) => {
      event.preventDefault();
      setDragOverTarget(null);

      const sourcePath = event.dataTransfer.getData("text/x-kiss-file-path");
      if (!sourcePath || !onMoveFile) return;

      onMoveFile(sourcePath, targetFolder);
    },
    [onMoveFile],
  );

  const handleRootDragOver = useCallback(
    (event: DragEvent) => {
      if (!onMoveFile) return;
      handleDragOver(event, "__root__");
    },
    [handleDragOver, onMoveFile],
  );

  const handleRootDrop = useCallback(
    (event: DragEvent) => {
      handleDrop(event, "");
    },
    [handleDrop],
  );

  return (
    <div
      className={`file-tree${dragOverTarget === "__root__" ? " file-tree-drop-target" : ""}`}
      role="tree"
      onDragOver={onMoveFile ? handleRootDragOver : undefined}
      onDragLeave={onMoveFile ? handleDragLeave : undefined}
      onDrop={onMoveFile ? handleRootDrop : undefined}
    >
      {tree.map((node) => (
        <FileTreeNodeRow
          depth={0}
          dragOverTarget={dragOverTarget}
          expandedDirectories={expandedDirectories}
          key={node.key}
          node={node}
          onDeleteFile={onDeleteFile}
          onDragLeave={onMoveFile ? handleDragLeave : undefined}
          onDragOver={onMoveFile ? handleDragOver : undefined}
          onDrop={onMoveFile ? handleDrop : undefined}
          onMoveFile={onMoveFile}
          onSelectFile={onSelectFile}
          onToggleDirectory={toggleDirectory}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

function FileTreeNodeRow({
  node,
  depth,
  dragOverTarget,
  expandedDirectories,
  selectedPath,
  onDeleteFile,
  onDragLeave,
  onDragOver,
  onDrop,
  onMoveFile,
  onSelectFile,
  onToggleDirectory,
}: {
  node: FileTreeNode;
  depth: number;
  dragOverTarget: string | null;
  expandedDirectories: Set<string>;
  selectedPath: string | null;
  onDeleteFile?: (path: string) => void;
  onDragLeave?: () => void;
  onDragOver?: (event: DragEvent, target: string) => void;
  onDrop?: (event: DragEvent, targetFolder: string) => void;
  onMoveFile?: (sourcePath: string, targetFolder: string) => void;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (directoryKey: string) => void;
}) {
  const depthStyle = { "--tree-depth": String(Math.min(depth, 6)) } as CSSProperties;

  if (node.type === "directory") {
    const isExpanded = expandedDirectories.has(node.key);
    const visibleName = humanizePathSegment(node.name);
    const isDragOver = dragOverTarget === node.key;

    return (
      <div className="file-tree-node">
        <button
          aria-expanded={isExpanded}
          className={`file-tree-row file-tree-directory${isDragOver ? " file-tree-drop-target" : ""}`}
          onClick={() => onToggleDirectory(node.key)}
          onDragOver={
            onDragOver
              ? (event: DragEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  onDragOver(event, node.key);
                }
              : undefined
          }
          onDragLeave={
            onDragLeave
              ? (event: DragEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  onDragLeave();
                }
              : undefined
          }
          onDrop={
            onDrop
              ? (event: DragEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  onDrop(event, node.name);
                }
              : undefined
          }
          role="treeitem"
          style={depthStyle}
          title={node.fullPath}
        >
          <span className="file-tree-toggle">{isExpanded ? "▾" : "▸"}</span>
          <span className="file-tree-label">{visibleName}</span>
        </button>

        {isExpanded ? (
          <div className="file-tree-children" role="group">
            {node.children.map((child) => (
              <FileTreeNodeRow
                depth={depth + 1}
                dragOverTarget={dragOverTarget}
                expandedDirectories={expandedDirectories}
                key={child.key}
                node={child}
                onDeleteFile={onDeleteFile}
                onDragLeave={onDragLeave}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onMoveFile={onMoveFile}
                onSelectFile={onSelectFile}
                onToggleDirectory={onToggleDirectory}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const className = [
    "file-tree-row",
    "file-tree-file",
    selectedPath === node.file.path ? "active" : "",
    node.file.previewable === false ? "not-previewable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleDragStart = onMoveFile
    ? (event: DragEvent<HTMLButtonElement | HTMLDivElement>) => {
        event.dataTransfer.setData("text/x-kiss-file-path", node.file.path);
        event.dataTransfer.effectAllowed = "move";
      }
    : undefined;

  const fileLabel = (
    <>
      <span className="file-tree-toggle" aria-hidden="true" />
      <span className="file-tree-label">{humanizePathSegment(node.name)}</span>
      {node.file.previewable === false ? <small>file</small> : null}
    </>
  );

  if (onDeleteFile) {
    return (
      <div
        className={`${className} with-actions`}
        draggable={!!onMoveFile}
        onDragStart={handleDragStart}
        role="treeitem"
        style={depthStyle}
        title={node.file.path}
      >
        <button className="file-tree-open-button" onClick={() => onSelectFile(node.file.path)} type="button">
          {fileLabel}
        </button>
        <button
          className="file-tree-delete-button"
          onClick={() => onDeleteFile(node.file.path)}
          title={`Delete ${node.file.path}`}
          type="button"
        >
          Delete
        </button>
      </div>
    );
  }

  return (
    <button
      className={className}
      draggable={!!onMoveFile}
      onDragStart={handleDragStart}
      onClick={() => onSelectFile(node.file.path)}
      role="treeitem"
      style={depthStyle}
      title={node.file.previewable === false ? `${node.file.path} (saved, no preview)` : node.file.path}
    >
      {fileLabel}
    </button>
  );
}
