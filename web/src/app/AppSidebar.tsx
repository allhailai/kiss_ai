import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ProjectFile, ProjectStatus } from "../contracts/api";
import { useRouteContext } from "./contexts/RouteContext";
import { SimplifiedNavigator } from "../features/navigation/WorkflowMenus";

function ServerVersion() {
  const [version, setVersion] = useState<{ gitHash: string; startedAt: string } | null>(null);

  useEffect(() => {
    fetch("/api/version")
      .then((r) => r.json())
      .then(setVersion)
      .catch(() => {});
  }, []);

  if (!version) return null;

  const startedDate = new Date(version.startedAt);
  const timeStr = startedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="sidebar-version" title={`Server started at ${version.startedAt}`}>
      <span className="sidebar-version-hash">{version.gitHash}</span>
      <span className="sidebar-version-separator">·</span>
      <span className="sidebar-version-time">↑ {timeStr}</span>
    </div>
  );
}

export function AppSidebar({
  collapsed,
  fileWorkspace,
  leftNavWidth,
  onCollapse,
  onExpand,
  onOpenFile,
  projectSlug,
  rebuildWorkspace,
}: {
  collapsed: boolean;
  fileWorkspace: {
    humanInputEmptyDirectories: string[];
    loading: boolean;
    projectFiles: ProjectFile[];
    selected: { path: string } | null;
    createHumanInputFolder: (name: string) => Promise<void>;
    createHumanInputTextFile: (name: string, folder?: string) => Promise<void>;
    deleteHumanInputFile: (path: string) => Promise<void>;
    deleteHumanInputFolder: (folder: string) => Promise<void>;
    deleteProjectFile: (path: string) => Promise<void>;
    deleteProjectFolder: (folder: string) => Promise<void>;
    moveHumanInputFile: (sourcePath: string, targetFolder: string) => Promise<void>;
    uploadHumanInputFiles: (files: File[]) => Promise<void>;
  };
  leftNavWidth: {
    isResizable: boolean;
    maxWidthPx: number;
    minWidthPx: number;
    widthPx: number;
    commitWidth: () => void;
    resizeByKeyboard: (direction: "wider" | "narrower") => void;
    resizeFromClientX: (clientX: number) => void;
  };
  onCollapse: () => void;
  onExpand: () => void;
  onOpenFile: (path: string) => void;
  projectSlug: string;
  rebuildWorkspace: {
    rebuild: { running: boolean } | null;
    status: ProjectStatus | null;
  };
}) {
  const route = useRouteContext();
  const resizingRef = useRef(false);

  return (
    <>
      <button
        aria-label="Open navigation"
        className="sidebar-open-button"
        onClick={onExpand}
        type="button"
      >
        Nav
      </button>

      <aside className="sidebar" aria-label="Project navigation">
        {leftNavWidth.isResizable ? (
          <div
            aria-label="Resize navigation"
            aria-orientation="vertical"
            aria-valuemax={Math.round(leftNavWidth.maxWidthPx)}
            aria-valuemin={Math.round(leftNavWidth.minWidthPx)}
            aria-valuenow={Math.round(leftNavWidth.widthPx)}
            className="sidebar-resize-handle"
            onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                leftNavWidth.resizeByKeyboard("wider");
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                leftNavWidth.resizeByKeyboard("narrower");
              }
            }}
            onPointerCancel={(event: ReactPointerEvent<HTMLDivElement>) => {
              if (!resizingRef.current) return;
              resizingRef.current = false;
              event.currentTarget.releasePointerCapture(event.pointerId);
              leftNavWidth.commitWidth();
            }}
            onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
              event.preventDefault();
              resizingRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              leftNavWidth.resizeFromClientX(event.clientX);
            }}
            onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
              if (!resizingRef.current) return;
              leftNavWidth.resizeFromClientX(event.clientX);
            }}
            onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
              if (!resizingRef.current) return;
              resizingRef.current = false;
              event.currentTarget.releasePointerCapture(event.pointerId);
              leftNavWidth.commitWidth();
            }}
            role="separator"
            tabIndex={0}
            title="Drag to resize navigation"
          />
        ) : null}
        <button
          aria-label="Close navigation"
          className="sidebar-close-button"
          onClick={onCollapse}
          title="Close navigation"
          type="button"
        >
          x
        </button>
        <SimplifiedNavigator
          currentView={route.view}
          humanInputEmptyDirectories={fileWorkspace.humanInputEmptyDirectories}
          loading={fileWorkspace.loading}
          projectFiles={fileWorkspace.projectFiles}
          selectedPath={fileWorkspace.selected?.path ?? null}
          projectSlug={projectSlug}
          selectedArtifactSlug={route.view === "artifacts" ? (route.filePath ?? null) : null}
          onCreateFolder={(name) => void fileWorkspace.createHumanInputFolder(name)}
          onCreateTextFile={(name, folder) => void fileWorkspace.createHumanInputTextFile(name, folder)}
          onDeleteFolder={(folder) => void fileWorkspace.deleteHumanInputFolder(folder)}
          onDeleteHumanInputFile={(path) => void fileWorkspace.deleteHumanInputFile(path)}
          onDeleteProjectFile={(path) => void fileWorkspace.deleteProjectFile(path)}
          onDeleteProjectFolder={(folder) => void fileWorkspace.deleteProjectFolder(folder)}
          onMoveFile={(sourcePath, targetFolder) => void fileWorkspace.moveHumanInputFile(sourcePath, targetFolder)}
          onUploadFiles={fileWorkspace.uploadHumanInputFiles}
          onOpenFile={onOpenFile}
          onOpenView={(nextView, filePath) => route.navigateTo(nextView, filePath)}
          rebuildRunning={rebuildWorkspace.rebuild?.running ?? false}
        />
        <div className="sidebar-footer-actions">
          <button
            className={`sidebar-settings-button${route.view === "settings" ? " active" : ""}`}
            onClick={() => route.navigateTo("settings")}
            title="Settings"
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6.5 1.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1.05a5 5 0 0 1 1.37.57l.74-.74a.5.5 0 0 1 .71 0l1.41 1.41a.5.5 0 0 1 0 .71l-.74.74c.26.43.45.89.57 1.37h1.05a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-1.05a5 5 0 0 1-.57 1.37l.74.74a.5.5 0 0 1 0 .71l-1.41 1.41a.5.5 0 0 1-.71 0l-.74-.74a5 5 0 0 1-1.37.57v1.05a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5v-1.05a5 5 0 0 1-1.37-.57l-.74.74a.5.5 0 0 1-.71 0L2.27 12.1a.5.5 0 0 1 0-.71l.74-.74A5 5 0 0 1 2.44 9.3H1.39a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5h1.05a5 5 0 0 1 .57-1.37l-.74-.74a.5.5 0 0 1 0-.71L3.68 2.1a.5.5 0 0 1 .71 0l.74.74A5 5 0 0 1 6.5 2.27V1.5zM8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" fill="currentColor"/>
            </svg>
            Settings
          </button>
        </div>
        <ServerVersion />
      </aside>
    </>
  );
}

