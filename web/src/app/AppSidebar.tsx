import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ProjectFile, ProjectStatus } from "../contracts/api";
import type { View } from "../navigation/views";
import { SimplifiedNavigator } from "../features/navigation/WorkflowMenus";

export function AppSidebar({
  collapsed,
  fileWorkspace,
  leftNavWidth,
  onCollapse,
  onExpand,
  onOpenFile,
  onOpenView,
  rebuildWorkspace,
  route,
}: {
  collapsed: boolean;
  fileWorkspace: {
    humanInputEmptyDirectories: string[];
    projectFiles: ProjectFile[];
    selected: { path: string } | null;
    treeLoading: boolean;
    createHumanInputFolder: (name: string) => Promise<void>;
    createHumanInputTextFile: (name: string, folder?: string) => Promise<void>;
    deleteHumanInputFile: (path: string) => Promise<void>;
    deleteHumanInputFolder: (folder: string) => Promise<void>;
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
  onOpenView: (nextView: View, filePath?: string | null) => void;
  rebuildWorkspace: {
    status: ProjectStatus | null;
  };
  route: { view: View };
}) {
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
          openQuestionsCount={rebuildWorkspace.status?.openQuestionsCount}
          blockingQuestionsCount={rebuildWorkspace.status?.blockingQuestionsCount}
          pendingSuggestionsCount={rebuildWorkspace.status?.pendingSuggestionsCount}
          seedTopicsCount={rebuildWorkspace.status?.seedTopicsCount}
          loading={fileWorkspace.treeLoading}
          projectFiles={fileWorkspace.projectFiles}
          selectedPath={fileWorkspace.selected?.path ?? null}
          onCreateFolder={(name) => void fileWorkspace.createHumanInputFolder(name)}
          onCreateTextFile={(name, folder) => void fileWorkspace.createHumanInputTextFile(name, folder)}
          onDeleteFolder={(folder) => void fileWorkspace.deleteHumanInputFolder(folder)}
          onDeleteHumanInputFile={(path) => void fileWorkspace.deleteHumanInputFile(path)}
          onMoveFile={(sourcePath, targetFolder) => void fileWorkspace.moveHumanInputFile(sourcePath, targetFolder)}
          onUploadFiles={fileWorkspace.uploadHumanInputFiles}
          onOpenFile={onOpenFile}
          onOpenView={(nextView, filePath) => onOpenView(nextView, filePath)}
        />
      </aside>
    </>
  );
}
