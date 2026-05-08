import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ProjectFile } from "../../contracts/api";
import { buildFileTree, getAncestorDirectoryKeys, humanizePathSegment, type FileTreeNode } from "../../domain/files";

export function FileTreeNav({
  files,
  selectedPath,
  onDeleteFile,
  onSelectFile,
}: {
  files: ProjectFile[];
  selectedPath: string | null;
  onDeleteFile?: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const selectedAncestorKeys = useMemo(() => {
    const selectedFile = files.find((file) => file.path === selectedPath);
    return selectedFile ? getAncestorDirectoryKeys(selectedFile.name) : [];
  }, [files, selectedPath]);
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set());

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

  return (
    <div className="file-tree" role="tree">
      {tree.map((node) => (
        <FileTreeNodeRow
          depth={0}
          expandedDirectories={expandedDirectories}
          key={node.key}
          node={node}
          onDeleteFile={onDeleteFile}
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
  expandedDirectories,
  selectedPath,
  onDeleteFile,
  onSelectFile,
  onToggleDirectory,
}: {
  node: FileTreeNode;
  depth: number;
  expandedDirectories: Set<string>;
  selectedPath: string | null;
  onDeleteFile?: (path: string) => void;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (directoryKey: string) => void;
}) {
  const depthStyle = { "--tree-depth": String(Math.min(depth, 6)) } as CSSProperties;

  if (node.type === "directory") {
    const isExpanded = expandedDirectories.has(node.key);
    const visibleName = humanizePathSegment(node.name);

    return (
      <div className="file-tree-node">
        <button
          aria-expanded={isExpanded}
          className="file-tree-row file-tree-directory"
          onClick={() => onToggleDirectory(node.key)}
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
                expandedDirectories={expandedDirectories}
                key={child.key}
                node={child}
                onDeleteFile={onDeleteFile}
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
  const fileLabel = (
    <>
      <span className="file-tree-toggle" aria-hidden="true" />
      <span className="file-tree-label">{humanizePathSegment(node.name)}</span>
      {node.file.previewable === false ? <small>file</small> : null}
    </>
  );

  if (onDeleteFile) {
    return (
      <div className={`${className} with-actions`} role="treeitem" style={depthStyle} title={node.file.path}>
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
      onClick={() => onSelectFile(node.file.path)}
      role="treeitem"
      style={depthStyle}
      title={node.file.previewable === false ? `${node.file.path} (saved, no preview)` : node.file.path}
    >
      {fileLabel}
    </button>
  );
}
