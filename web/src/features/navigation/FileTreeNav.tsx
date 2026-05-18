import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import type { ProjectFile } from "../../contracts/api";
import { buildFileTree, getAncestorDirectoryKeys, humanizePathSegment, type FileTreeNode } from "../../domain/files";

export function FileTreeNav({
  files,
  emptyDirectories,
  selectedPath,
  onCreateTextFile,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  onSelectFile,
}: {
  files: ProjectFile[];
  emptyDirectories?: string[];
  selectedPath: string | null;
  onCreateTextFile?: (name: string, folder?: string) => void;
  onDeleteFile?: (path: string) => void;
  onDeleteFolder?: (folder: string) => void;
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
  const [inlineCreateFolder, setInlineCreateFolder] = useState<string | null>(null);

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

  const handleToggleInlineCreate = useCallback((folderName: string) => {
    setInlineCreateFolder((current) => (current === folderName ? null : folderName));
  }, []);

  const handleInlineCreateSubmit = useCallback(
    (name: string, folder: string) => {
      if (onCreateTextFile) {
        onCreateTextFile(name, folder);
      }
      setInlineCreateFolder(null);
    },
    [onCreateTextFile],
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
          inlineCreateFolder={inlineCreateFolder}
          key={node.key}
          node={node}
          onCreateTextFile={onCreateTextFile}
          onDeleteFile={onDeleteFile}
          onDeleteFolder={onDeleteFolder}
          onDragLeave={onMoveFile ? handleDragLeave : undefined}
          onDragOver={onMoveFile ? handleDragOver : undefined}
          onDrop={onMoveFile ? handleDrop : undefined}
          onInlineCreateSubmit={handleInlineCreateSubmit}
          onMoveFile={onMoveFile}
          onSelectFile={onSelectFile}
          onToggleDirectory={toggleDirectory}
          onToggleInlineCreate={handleToggleInlineCreate}
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
  inlineCreateFolder,
  selectedPath,
  onCreateTextFile,
  onDeleteFile,
  onDeleteFolder,
  onDragLeave,
  onDragOver,
  onDrop,
  onInlineCreateSubmit,
  onMoveFile,
  onSelectFile,
  onToggleDirectory,
  onToggleInlineCreate,
}: {
  node: FileTreeNode;
  depth: number;
  dragOverTarget: string | null;
  expandedDirectories: Set<string>;
  inlineCreateFolder: string | null;
  selectedPath: string | null;
  onCreateTextFile?: (name: string, folder?: string) => void;
  onDeleteFile?: (path: string) => void;
  onDeleteFolder?: (folder: string) => void;
  onDragLeave?: () => void;
  onDragOver?: (event: DragEvent, target: string) => void;
  onDrop?: (event: DragEvent, targetFolder: string) => void;
  onInlineCreateSubmit: (name: string, folder: string) => void;
  onMoveFile?: (sourcePath: string, targetFolder: string) => void;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (directoryKey: string) => void;
  onToggleInlineCreate: (folderName: string) => void;
}) {
  const depthStyle = { "--tree-depth": String(Math.min(depth, 6)) } as CSSProperties;

  if (node.type === "directory") {
    const isExpanded = expandedDirectories.has(node.key);
    const visibleName = humanizePathSegment(node.name);
    const isDragOver = dragOverTarget === node.key;
    const showInlineCreate = inlineCreateFolder === node.name;
    const hasDirectoryActions = onDeleteFolder || onCreateTextFile;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [pendingDeleteFolder, setPendingDeleteFolder] = useState(false);

    return (
      <div className="file-tree-node">
        <div
          className={`file-tree-row file-tree-directory${isDragOver ? " file-tree-drop-target" : ""}${hasDirectoryActions ? " with-dir-actions" : ""}`}
          style={depthStyle}
          title={node.fullPath}
          onDragOver={
            onDragOver
              ? (event: DragEvent<HTMLDivElement>) => {
                  event.stopPropagation();
                  onDragOver(event, node.key);
                }
              : undefined
          }
          onDragLeave={
            onDragLeave
              ? (event: DragEvent<HTMLDivElement>) => {
                  event.stopPropagation();
                  onDragLeave();
                }
              : undefined
          }
          onDrop={
            onDrop
              ? (event: DragEvent<HTMLDivElement>) => {
                  event.stopPropagation();
                  onDrop(event, node.name);
                }
              : undefined
          }
        >
          <button
            aria-expanded={isExpanded}
            className="file-tree-dir-toggle"
            onClick={() => onToggleDirectory(node.key)}
            type="button"
          >
            <span className="file-tree-toggle">{isExpanded ? "▾" : "▸"}</span>
            <span className="file-tree-label">{visibleName}</span>
          </button>

          {hasDirectoryActions ? (
            <span className="file-tree-dir-actions">
              {onCreateTextFile ? (
                <button
                  className="file-tree-dir-action-button file-tree-dir-add"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleInlineCreate(node.name);
                    if (!isExpanded) onToggleDirectory(node.key);
                  }}
                  title={`New file in ${visibleName}`}
                  type="button"
                >
                  +
                </button>
              ) : null}
              {onDeleteFolder ? (
                pendingDeleteFolder ? (
                  <>
                    <button
                      autoFocus
                      className="file-tree-dir-action-button file-tree-dir-confirm-yes"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteFolder(node.name);
                      }}
                      title="Yes, delete this folder"
                      type="button"
                    >
                      Yes
                    </button>
                    <button
                      className="file-tree-dir-action-button file-tree-dir-confirm-no"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDeleteFolder(false);
                      }}
                      title="Cancel"
                      type="button"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <button
                    className="file-tree-dir-action-button file-tree-dir-delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPendingDeleteFolder(true);
                    }}
                    title={`Delete empty folder ${visibleName}`}
                    type="button"
                  >
                    ×
                  </button>
                )
              ) : null}
            </span>
          ) : null}
        </div>

        {isExpanded ? (
          <div className="file-tree-children" role="group">
            {showInlineCreate ? (
              <InlineCreateFileForm
                depth={depth + 1}
                folder={node.name}
                onCancel={() => onToggleInlineCreate(node.name)}
                onSubmit={onInlineCreateSubmit}
              />
            ) : null}
            {node.children.map((child) => (
              <FileTreeNodeRow
                depth={depth + 1}
                dragOverTarget={dragOverTarget}
                expandedDirectories={expandedDirectories}
                inlineCreateFolder={inlineCreateFolder}
                key={child.key}
                node={child}
                onCreateTextFile={onCreateTextFile}
                onDeleteFile={onDeleteFile}
                onDeleteFolder={onDeleteFolder}
                onDragLeave={onDragLeave}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onInlineCreateSubmit={onInlineCreateSubmit}
                onMoveFile={onMoveFile}
                onSelectFile={onSelectFile}
                onToggleDirectory={onToggleDirectory}
                onToggleInlineCreate={onToggleInlineCreate}
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
      <FileRowWithDelete
        className={className}
        depthStyle={depthStyle}
        draggable={!!onMoveFile}
        fileLabel={fileLabel}
        filePath={node.file.path}
        handleDragStart={handleDragStart}
        onDeleteFile={onDeleteFile}
        onSelectFile={onSelectFile}
      />
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

function FileRowWithDelete({
  className,
  depthStyle,
  draggable,
  fileLabel,
  filePath,
  handleDragStart,
  onDeleteFile,
  onSelectFile,
}: {
  className: string;
  depthStyle: CSSProperties;
  draggable: boolean;
  fileLabel: React.ReactNode;
  filePath: string;
  handleDragStart?: (event: DragEvent<HTMLButtonElement | HTMLDivElement>) => void;
  onDeleteFile: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState(false);

  return (
    <div
      className={`${className} with-actions`}
      draggable={draggable}
      onDragStart={handleDragStart}
      role="treeitem"
      style={depthStyle}
      title={filePath}
    >
      <button className="file-tree-open-button" onClick={() => onSelectFile(filePath)} type="button">
        {fileLabel}
      </button>
      {pendingDelete ? (
        <>
          <button
            autoFocus
            className="file-tree-dir-action-button file-tree-dir-confirm-yes"
            onClick={() => onDeleteFile(filePath)}
            type="button"
            title="Yes, delete this file"
          >
            Yes
          </button>
          <button
            className="file-tree-dir-action-button file-tree-dir-confirm-no"
            onClick={() => setPendingDelete(false)}
            type="button"
            title="Cancel"
          >
            No
          </button>
        </>
      ) : (
        <button
          className="file-tree-delete-button"
          onClick={(event) => {
            event.stopPropagation();
            setPendingDelete(true);
          }}
          type="button"
          title={`Delete ${filePath}`}
        >
          ×
        </button>
      )}
    </div>
  );
}



function InlineCreateFileForm({
  depth,
  folder,
  onCancel,
  onSubmit,
}: {
  depth: number;
  folder: string;
  onCancel: () => void;
  onSubmit: (name: string, folder: string) => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed, folder);
  }

  const depthStyle = { "--tree-depth": String(Math.min(depth, 6)) } as CSSProperties;

  return (
    <form
      className="file-tree-inline-form"
      style={depthStyle}
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <input
        ref={inputRef}
        className="file-tree-inline-input"
        type="text"
        placeholder="File name…"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        maxLength={200}
      />
      <button
        className="file-tree-inline-submit"
        type="submit"
        disabled={!name.trim()}
      >
        ✓
      </button>
      <button
        className="file-tree-inline-cancel"
        type="button"
        onClick={onCancel}
      >
        ✕
      </button>
    </form>
  );
}
