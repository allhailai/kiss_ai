import { registerAiRoutes } from "./aiRoutes.js";
import { registerChatRoutes } from "./chatRoutes.js";
import { registerFileRoutes } from "./fileRoutes.js";
import { registerProjectRoutes } from "./projectRoutes.js";
import { registerRebuildRoutes } from "./rebuildRoutes.js";
import { registerSystemRoutes } from "./systemRoutes.js";

export function registerApiRoutes(app, deps) {
  app.use("/api/projects/:projectSlug", deps.attachProject);

  registerSystemRoutes(app, {
    authMiddleware: deps.authMiddleware,
    checkKissAiUpdate: deps.checkKissAiUpdate,
    httpError: deps.httpError,
    KISS_AI_MODE: deps.KISS_AI_MODE,
    readKeybindings: deps.readKeybindings,
    readPinnedProjects: deps.readPinnedProjects,
    readProjectsViewPreference: deps.readProjectsViewPreference,
    saveCursorApiKey: deps.saveCursorApiKey,
    systemSettings: deps.systemSettings,
    updateAndRestart: deps.updateAndRestart,
    updateKissAi: deps.updateKissAi,
    writePinnedProjects: deps.writePinnedProjects,
    writeProjectsViewPreference: deps.writeProjectsViewPreference,
  });

  registerProjectRoutes(app, {
    PROJECTS_ROOT: deps.PROJECTS_ROOT,
    assistQuestion: deps.assistQuestion,
    buildLogTabState: deps.buildLogTabState,
    createProjectFromTemplate: deps.createProjectFromTemplate,
    discoverProjects: deps.discoverProjects,
    displayProjectName: deps.displayProjectName,
    getHumanAttentionItems: deps.getHumanAttentionItems,
    gitStatus: deps.gitStatus,
    httpError: deps.httpError,
    listCursorModels: deps.listCursorModels,
    pickRebuildModelId: deps.pickRebuildModelId,
    readProjectJson: deps.readProjectJson,
    readProjectUiState: deps.readProjectUiState,
    readTextFile: deps.readTextFile,
    resolveCursorApiKey: deps.resolveCursorApiKey,
    writeProjectUiState: deps.writeProjectUiState,
    uploadExternalRepoZip: deps.uploadExternalRepoZip,
  });

  registerChatRoutes(app, {
    applyEditProposal: deps.applyEditProposal,
    cancelChatAgent: deps.cancelChatAgent,
    createConversation: deps.createConversation,
    editChatMessage: deps.editChatMessage,

    httpError: deps.httpError,
    listConversations: deps.listConversations,
    readConversation: deps.readConversation,
    sendChatMessage: deps.sendChatMessage,
    subscribeToConversation: deps.subscribeToConversation,
    updateConversation: deps.updateConversation,
    updateEditProposal: deps.updateEditProposal,
    updateMessageArtifactRenameStatus: deps.updateMessageArtifactRenameStatus,
    updateMessageFileEditStatus: deps.updateMessageFileEditStatus,
    updateMessageFileRenameStatus: deps.updateMessageFileRenameStatus,
  });

  registerFileRoutes(app, {
    browseLocalDirs: deps.browseLocalDirs,
    createHumanInputFolder: deps.createHumanInputFolder,
    createHumanInputTextFile: deps.createHumanInputTextFile,
    deleteHumanInputFile: deps.deleteHumanInputFile,
    deleteHumanInputFolder: deps.deleteHumanInputFolder,
    deleteProjectFile: deps.deleteProjectFile,
    deleteProjectFolder: deps.deleteProjectFolder,
    gitFileDiff: deps.gitFileDiff,
    humanFiles: deps.humanFiles,
    httpError: deps.httpError,
    listMarkdownFiles: deps.listMarkdownFiles,
    listProjectFiles: deps.listProjectFiles,
    moveHumanInputFile: deps.moveHumanInputFile,
    readTextFile: deps.readTextFile,
    renameOutputFile: deps.renameOutputFile,
    restoreFileFromHead: deps.restoreFileFromHead,
    searchFiles: deps.searchFiles,
    treeRoots: deps.treeRoots,
    uploadHumanInputFiles: deps.uploadHumanInputFiles,
    writeTextFile: deps.writeTextFile,
  });

  registerAiRoutes(app, {
    lintDesignIdentity: deps.lintDesignIdentity,
    parseDesignIdentity: deps.parseDesignIdentity,
    readTextFile: deps.readTextFile,
  });

  registerRebuildRoutes(app, {
    cancelAgentJob: deps.cancelAgentJob,
    getOutputStatus: deps.getOutputStatus,
    getRebuildState: deps.getRebuildState,
    httpError: deps.httpError,
    startFullRebuild: deps.startFullRebuild,
    startHumanAttentionResolution: deps.startHumanAttentionResolution,
    startKnowledgeBuild: deps.startKnowledgeBuild,
    startOutputBuild: deps.startOutputBuild,
    startRebuild: deps.startRebuild,
    subscribeToRebuild: deps.subscribeToRebuild,
  });
}
