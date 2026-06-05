import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import type { FileChangeStatus, ProjectFile } from "../../contracts/api";
import { buildFileTree, getAncestorDirectoryKeys, humanizePathSegment, type FileTreeNode } from "../../domain/files";

export function FileTreeNav({
  fileChanges,
  files,
  emptyDirectories,
  selectedPath,
  onCreateTextFile,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  onSelectFile,
}: {
  fileChanges?: Record<string, FileChangeStatus>;
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

  // Track the path being dragged in a ref so it survives across events reliably.
  const draggingPathRef = useRef<string | null>(null);

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

  const handleFileDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement | HTMLDivElement>, filePath: string) => {
      draggingPathRef.current = filePath;
      event.dataTransfer.setData("text/x-kiss-file-path", filePath);
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const handleDrop = useCallback(
    (event: DragEvent, targetFolder: string) => {
      event.preventDefault();
      event.stopPropagation();
      setDragOverTarget(null);

      const sourcePath = draggingPathRef.current ?? event.dataTransfer.getData("text/x-kiss-file-path");
      draggingPathRef.current = null;
      if (!sourcePath || !onMoveFile) return;

      onMoveFile(sourcePath, targetFolder);
    },
    [onMoveFile],
  );

  return (
    <div
      className={`file-tree${dragOverTarget === "__root__" ? " file-tree-drop-target" : ""}`}
      role="tree"
      onDragOver={onMoveFile ? (event) => {
        event.preventDefault();
        if (!draggingPathRef.current) return;
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        setDragOverTarget("__root__");
      } : undefined}
      onDragLeave={onMoveFile ? (event) => {
        const related = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(related)) {
          setDragOverTarget(null);
        }
      } : undefined}
      onDrop={onMoveFile ? (event) => {
        if (!draggingPathRef.current) return;
        handleDrop(event, "");
      } : undefined}
    >
      {tree.map((node) => (
        <FileTreeNodeRow
          depth={0}
          dragOverTarget={dragOverTarget}
          expandedDirectories={expandedDirectories}
          fileChanges={fileChanges}
          inlineCreateFolder={inlineCreateFolder}
          key={node.key}
          node={node}
          onCreateTextFile={onCreateTextFile}
          onDeleteFile={onDeleteFile}
          onDeleteFolder={onDeleteFolder}
          onFileDragStart={onMoveFile ? handleFileDragStart : undefined}
          onDrop={onMoveFile ? handleDrop : undefined}
          setDragOverTarget={onMoveFile ? setDragOverTarget : undefined}
          draggingPathRef={onMoveFile ? draggingPathRef : undefined}
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
  fileChanges,
  inlineCreateFolder,
  selectedPath,
  onCreateTextFile,
  onDeleteFile,
  onDeleteFolder,
  onDrop,
  onFileDragStart,
  onInlineCreateSubmit,
  onMoveFile,
  onSelectFile,
  onToggleDirectory,
  onToggleInlineCreate,
  setDragOverTarget,
  draggingPathRef,
}: {
  node: FileTreeNode;
  depth: number;
  dragOverTarget: string | null;
  expandedDirectories: Set<string>;
  fileChanges?: Record<string, FileChangeStatus>;
  inlineCreateFolder: string | null;
  selectedPath: string | null;
  onCreateTextFile?: (name: string, folder?: string) => void;
  onDeleteFile?: (path: string) => void;
  onDeleteFolder?: (folder: string) => void;
  onDrop?: (event: DragEvent, targetFolder: string) => void;
  onFileDragStart?: (event: DragEvent<HTMLButtonElement | HTMLDivElement>, filePath: string) => void;
  onInlineCreateSubmit: (name: string, folder: string) => void;
  onMoveFile?: (sourcePath: string, targetFolder: string) => void;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (directoryKey: string) => void;
  onToggleInlineCreate: (folderName: string) => void;
  setDragOverTarget?: (target: string | null) => void;
  draggingPathRef?: React.RefObject<string | null>;
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
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const dragDepthRef = useRef(0);

    return (
      <div className="file-tree-node">
        <div
          className={`file-tree-row file-tree-directory${isDragOver ? " file-tree-drop-target" : ""}${hasDirectoryActions ? " with-dir-actions" : ""}`}
          style={depthStyle}
          title={node.fullPath}
          onDragEnter={setDragOverTarget && draggingPathRef
            ? (event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                if (!draggingPathRef.current) return;
                event.stopPropagation();
                dragDepthRef.current += 1;
                setDragOverTarget(node.key);
              }
            : undefined}
          onDragLeave={setDragOverTarget && draggingPathRef
            ? (event: DragEvent<HTMLDivElement>) => {
                if (!draggingPathRef.current) return;
                event.stopPropagation();
                dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                if (dragDepthRef.current === 0) setDragOverTarget(null);
              }
            : undefined}
          onDragOver={setDragOverTarget && draggingPathRef
            ? (event: DragEvent<HTMLDivElement>) => {
                // Always prevent default to stop browser from navigating to dropped OS files.
                event.preventDefault();
                // Only stop propagation for internal file-move drags.
                // OS file drags must bubble to the outer upload zone.
                if (!draggingPathRef.current) return;
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
              }
            : undefined}
          onDrop={onDrop
            ? (event: DragEvent<HTMLDivElement>) => {
                dragDepthRef.current = 0;
                onDrop(event, node.name);
              }
            : undefined}
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
                        onDeleteFolder(node.fullPath);
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
                fileChanges={fileChanges}
                inlineCreateFolder={inlineCreateFolder}
                key={child.key}
                node={child}
                onCreateTextFile={onCreateTextFile}
                onDeleteFile={onDeleteFile}
                onDeleteFolder={onDeleteFolder}
                onDrop={onDrop}
                onFileDragStart={onFileDragStart}
                onInlineCreateSubmit={onInlineCreateSubmit}
                onMoveFile={onMoveFile}
                onSelectFile={onSelectFile}
                onToggleDirectory={onToggleDirectory}
                onToggleInlineCreate={onToggleInlineCreate}
                setDragOverTarget={setDragOverTarget}
                draggingPathRef={draggingPathRef}
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

  const changeStatus = fileChanges?.[node.file.path];

  const fileLabel = (
    <>
      <span className="file-tree-toggle" aria-hidden="true" />
      <span className="file-tree-label">{humanizePathSegment(node.name)}</span>
      {node.file.previewable === false ? <small>file</small> : null}
      {changeStatus ? (
        <span className={`file-tree-badge file-tree-badge-${changeStatus}`}>
          {changeStatus}
        </span>
      ) : null}
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
        onDragStart={onFileDragStart}
        onDeleteFile={onDeleteFile}
        onSelectFile={onSelectFile}
      />
    );
  }

  return (
    <button
      className={className}
      draggable={!!onMoveFile}
      onDragStart={onFileDragStart ? (event) => onFileDragStart(event, node.file.path) : undefined}
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
  onDragStart,
  onDeleteFile,
  onSelectFile,
}: {
  className: string;
  depthStyle: CSSProperties;
  draggable: boolean;
  fileLabel: React.ReactNode;
  filePath: string;
  onDragStart?: (event: DragEvent<HTMLButtonElement | HTMLDivElement>, filePath: string) => void;
  onDeleteFile: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState(false);

  return (
    <div
      className={`${className} with-actions`}
      role="treeitem"
      style={depthStyle}
      title={filePath}
    >
      <button
        className="file-tree-open-button"
        draggable={draggable}
        onClick={() => onSelectFile(filePath)}
        onDragStart={onDragStart ? (event) => onDragStart(event, filePath) : undefined}
        type="button"
      >
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
