import { registerAiRoutes } from "./aiRoutes.js";
import { registerChatRoutes } from "./chatRoutes.js";
import { registerFileRoutes } from "./fileRoutes.js";
import { registerProjectRoutes } from "./projectRoutes.js";
import { registerRebuildRoutes } from "./rebuildRoutes.js";

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
    listCursorModels: deps.listCursorModels,
    listMarkdownFiles: deps.listMarkdownFiles,
    pickRebuildModelId: deps.pickRebuildModelId,
    readProjectJson: deps.readProjectJson,
    resolveCursorApiKey: deps.resolveCursorApiKey,
  });

  registerChatRoutes(app, {
    createConversation: deps.createConversation,
    editChatMessage: deps.editChatMessage,
    listConversations: deps.listConversations,
    readConversation: deps.readConversation,
    sendChatMessage: deps.sendChatMessage,
    subscribeToConversation: deps.subscribeToConversation,
    updateConversation: deps.updateConversation,
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
    acceptRequirementsAutoUpdate: deps.acceptRequirementsAutoUpdate,
    lintDesignIdentity: deps.lintDesignIdentity,
    parseDesignIdentity: deps.parseDesignIdentity,
    readTextFile: deps.readTextFile,
    runAiAssistProposal: deps.runAiAssistProposal,
    runRequirementsAutoUpdateProposal: deps.runRequirementsAutoUpdateProposal,
  });

  registerRebuildRoutes(app, {
    getRebuildState: deps.getRebuildState,
    startHumanAttentionResolution: deps.startHumanAttentionResolution,
    startRebuild: deps.startRebuild,
    subscribeToRebuild: deps.subscribeToRebuild,
  });
}
