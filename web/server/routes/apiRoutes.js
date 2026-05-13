import { registerAiRoutes } from "./aiRoutes.js";
import { registerChatRoutes } from "./chatRoutes.js";
import { registerFileRoutes } from "./fileRoutes.js";
import { registerProjectRoutes } from "./projectRoutes.js";
import { registerRebuildRoutes } from "./rebuildRoutes.js";
import { registerRequirementsSyncRoutes } from "./requirementsSyncRoutes.js";

export function registerApiRoutes(app, deps) {
  app.use("/api/projects/:projectSlug", deps.attachProject);

  registerProjectRoutes(app, {
    PROJECTS_ROOT: deps.PROJECTS_ROOT,
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
    resolveCursorApiKey: deps.resolveCursorApiKey,
  });

  registerChatRoutes(app, {
    applyEditProposal: deps.applyEditProposal,
    createConversation: deps.createConversation,
    editChatMessage: deps.editChatMessage,
    generateEditProposal: deps.generateEditProposal,
    httpError: deps.httpError,
    listConversations: deps.listConversations,
    readConversation: deps.readConversation,
    sendChatMessage: deps.sendChatMessage,
    subscribeToConversation: deps.subscribeToConversation,
    updateConversation: deps.updateConversation,
    updateEditProposal: deps.updateEditProposal,
  });

  registerFileRoutes(app, {
    deleteHumanInputFile: deps.deleteHumanInputFile,
    gitFileDiff: deps.gitFileDiff,
    humanFiles: deps.humanFiles,
    httpError: deps.httpError,
    listMarkdownFiles: deps.listMarkdownFiles,
    listProjectFiles: deps.listProjectFiles,
    readTextFile: deps.readTextFile,
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
    getRebuildState: deps.getRebuildState,
    httpError: deps.httpError,
    startHumanAttentionResolution: deps.startHumanAttentionResolution,
    startRebuild: deps.startRebuild,
    subscribeToRebuild: deps.subscribeToRebuild,
  });

  registerRequirementsSyncRoutes(app, {
    applyRequirementsSync: deps.applyRequirementsSync,
    httpError: deps.httpError,
    proposeRequirementsSync: deps.proposeRequirementsSync,
    recordRequirementsSyncReview: deps.recordRequirementsSyncReview,
    requirementsSyncSignals: deps.requirementsSyncSignals,
  });
}
