export type VersionResponse = {
  gitHash: string;
  startedAt: string;
  mode: "standalone" | "server";
};

export type KissAiUpdateCheckResponse = {
  status: "update_available" | "up_to_date";
  updateAvailable: boolean;
  localRevision: string;
  remoteRevision: string;
  upstream: string;
};

export type KissAiUpdateResponse = {
  status: "updated" | "up_to_date";
  beforeRevision: string;
  afterRevision: string;
  pullOutput: string;
  dependencyInstall: {
    ran: boolean;
    output: string;
  };
};

export type KissAiUpdateAndRestartResponse = {
  status: "updated" | "up_to_date";
  restarting: boolean;
  beforeRevision: string;
  afterRevision: string;
  pullOutput: string;
};

export type SystemSettingsResponse = {
  cursorApiKeyAvailable: boolean;
  cursorApiKeySource: string | null;
  cursorApiKeyWarnings: string[];
};

export type SaveCursorApiKeyRequest = {
  cursorApiKey: string;
};

export type SaveCursorApiKeyResponse = {
  ok: boolean;
  message: string;
};

export type Keybindings = {
  toggleLeftPanel: string;
  toggleRightPanel: string;
};
