export type BuildLogFileSection = {
  id: string;
  title: string;
};

export type BuildLogFileOption = {
  path: string;
  name: string;
  title: string;
  modifiedAt: string;
  sections: BuildLogFileSection[];
};

export type BuildLogFileContent = BuildLogFileOption & {
  selectedSectionId: string | null;
  content: string;
};

export type BuildLogTab = {
  id: string;
  label: string;
  emptyMessage: string;
  files: BuildLogFileOption[];
  selectedFile: BuildLogFileContent | null;
};

export type BuildLogState = {
  activeTabId: string;
  selectedLog: BuildLogFileContent | null;
  tabs: BuildLogTab[];
};
