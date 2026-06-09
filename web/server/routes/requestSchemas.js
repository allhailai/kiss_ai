import { z } from "zod";
import { MAX_USER_MESSAGE_BYTES } from "../contracts/chatLimits.js";

const MAX_WRITE_FILE_BYTES = 2 * 1024 * 1024;

function maxUtf8Bytes(maxBytes, message) {
  return z.string().refine((value) => Buffer.byteLength(value, "utf8") <= maxBytes, { message });
}

function optionalTrimmedString(maxLength) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .transform((value) => (value ? value : undefined));
}

const contextFileSchema = z.object({
  path: z.string().trim().min(1).max(300),
  label: optionalTrimmedString(160),
  kind: optionalTrimmedString(40),
});

const agentContextFileSchema = contextFileSchema.extend({
  editable: z.boolean().optional(),
  annotation: z.boolean().optional(),
  contentHash: optionalTrimmedString(160),
  draftContent: z.string().max(120_000).optional(),
  draftState: z.enum(["saved", "unsaved", "unknown"]).optional(),
  role: z.enum(["primary", "secondary"]).optional(),
});

const contextTopicSchema = z.object({
  topicId: z.string().trim().min(1).max(200),
  label: z.string().trim().max(300).optional(),
});

const chatContextSchema = z.object({
  currentFile: agentContextFileSchema.optional(),
  ai_editable_files: z.array(agentContextFileSchema).max(10).optional(),
  context_files: z.array(contextFileSchema).max(20).optional(),
  context_topics: z.array(contextTopicSchema).max(20).optional(),
});

const conversationFileContextSchema = z.object({
  ai_editable_files: z.array(agentContextFileSchema).max(10).optional(),
  context_files: z.array(contextFileSchema).max(20).optional(),
});

const conversationIdSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/, "Invalid conversation id.");
const optionalQueryString = (maxLength) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => (Array.isArray(value) ? value[0] : value))
    .pipe(z.string().trim().max(maxLength).optional())
    .transform((value) => value ?? "");

export const createConversationBodySchema = z.object({
  modelId: optionalTrimmedString(160),
  title: optionalTrimmedString(120),
});

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: optionalTrimmedString(160),
});

export const saveCursorApiKeyBodySchema = z.object({
  cursorApiKey: z.string().trim().min(1).max(500),
});

const projectRouteHashSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .regex(/^#\/p\/[a-zA-Z0-9][a-zA-Z0-9_-]*\/[a-z]+(?:\/[^#?]*)?(?:\?[^#]*)?$/, "Last route must be a project hash route.");

export const updateProjectUiStateBodySchema = z
  .object({
    lastRoute: z
      .object({
        hash: projectRouteHashSchema,
      })
      .optional(),
    preferredModelId: optionalTrimmedString(160),
  })
  .refine((body) => body.lastRoute !== undefined || body.preferredModelId !== undefined, {
    message: "At least one UI state field is required.",
  });

export const updateConversationBodySchema = z.object({
  title: optionalTrimmedString(120),
  summary: optionalTrimmedString(500),
  archived: z.boolean().optional(),
  fileContext: conversationFileContextSchema.optional(),
});

export const sendChatMessageBodySchema = z.object({
  modelId: z.string().trim().min(1).max(160),
  content: maxUtf8Bytes(MAX_USER_MESSAGE_BYTES, "Chat message is too large.").transform((value) => value.trim()).pipe(z.string().min(1)),
  context: chatContextSchema.optional(),
});

export const editChatMessageBodySchema = z.object({
  modelId: optionalTrimmedString(160),
  content: maxUtf8Bytes(MAX_USER_MESSAGE_BYTES, "Chat message is too large.").transform((value) => value.trim()).pipe(z.string().min(1)),
});




export const updateEditProposalBodySchema = z.object({
  conceptualDiffs: z.array(
    z.object({
      id: z.string().trim().min(1).max(80),
      status: z.enum(["accepted", "rejected"]),
    }),
  ),
});

export const applyEditProposalBodySchema = z.object({
  modelId: z.string().trim().min(1).max(160),
});

export const startRebuildBodySchema = z.object({
  modelId: z.string().trim().min(1).max(160),
});

export const resolveHumanAttentionBodySchema = z
  .object({
    modelId: z.string().trim().min(1).max(160),
    itemId: z.string().trim().min(1).max(300),
    resolutionOptionId: optionalTrimmedString(300),
    manualPrompt: optionalTrimmedString(20_000),
  })
  .refine((body) => Boolean(body.resolutionOptionId) !== Boolean(body.manualPrompt), {
    message: "Choose either a suggested option or a manual prompt.",
    path: ["resolutionOptionId"],
  });




export const createHumanInputTextFileBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  content: maxUtf8Bytes(MAX_WRITE_FILE_BYTES, "File content is too large.").optional().default(""),
  folder: z.string().trim().max(255).optional().default(""),
});

export const createHumanInputFolderBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  folder: z.string().trim().max(255).optional().default(""),
});

export const deleteHumanInputFolderBodySchema = z.object({
  folder: z.string().trim().min(1).max(255),
});

export const moveHumanInputFileBodySchema = z.object({
  sourcePath: z.string().trim().min(1).max(1_000),
  targetFolder: z.string().trim().max(1_000),
});

export const uploadHumanInputsBodySchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        type: z.string().optional(),
        size: z.number().nonnegative().optional(),
        contentBase64: z.string().min(1),
      }),
    )
    .min(1),
});

export const filePathBodySchema = z.object({
  path: z.string().trim().min(1).max(1_000),
});

export const recordFileChangeBodySchema = filePathBodySchema.extend({
  status: z.enum(["new", "edited"]),
});

export const writeFileBodySchema = filePathBodySchema.extend({
  content: maxUtf8Bytes(MAX_WRITE_FILE_BYTES, "File content is too large."),
  expectedContentHash: z.string().trim().min(1).max(160),
});

export const treeSectionParamsSchema = z.object({
  section: z.enum(["requirements", "human", "sources", "inputs-ai", "outputs", "logs"]),
});

export const filePathQuerySchema = z.object({
  path: optionalQueryString(1_000).pipe(z.string().min(1)),
});

export const searchFilesQuerySchema = z.object({
  q: optionalQueryString(300),
  filter: optionalQueryString(50),
});

export const buildLogQuerySchema = z.object({
  tab: optionalQueryString(160),
  path: optionalQueryString(1_000),
  summary: optionalQueryString(1_000),
  section: optionalQueryString(300),
});

export const conversationParamsSchema = z.object({
  conversationId: conversationIdSchema,
});

export const chatMessageParamsSchema = conversationParamsSchema.extend({
  messageId: z.string().trim().min(1).max(160),
});

export const editProposalParamsSchema = conversationParamsSchema.extend({
  proposalId: z.string().trim().regex(/^[a-zA-Z0-9_-]+$/, "Invalid edit proposal id."),
});

export const fileEditStatusParamsSchema = chatMessageParamsSchema.extend({
  editIndex: z.string().regex(/^\d+$/, "Edit index must be a number.").transform(Number),
});

export const updateFileEditStatusBodySchema = z.object({
  status: z.enum(["proposed", "applied", "rejected", "failed"]),
});

export const renameOutputFileBodySchema = z.object({
  fromPath: z.string().trim().min(1).max(1_000),
  toPath: z.string().trim().min(1).max(1_000),
});

export const fileRenameStatusParamsSchema = chatMessageParamsSchema.extend({
  renameIndex: z.string().regex(/^\d+$/, "Rename index must be a number.").transform(Number),
});

export const renameArtifactBodySchema = z.object({
  newSlug: z.string().trim().min(1).max(255).regex(/^[a-z0-9][a-z0-9_]*$/, "Slug must be lowercase alphanumeric with underscores."),
});

export const artifactRenameStatusParamsSchema = chatMessageParamsSchema.extend({
  renameIndex: z.string().regex(/^\d+$/, "Rename index must be a number.").transform(Number),
});

export const createArtifactBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  body: z.string().max(100_000).optional().default(""),
});

export const updateArtifactBodySchema = z
  .object({
    frontmatter: z.record(z.string(), z.unknown()).optional(),
    body: z.string().max(100_000).optional(),
  })
  .refine((value) => value.frontmatter !== undefined || value.body !== undefined, {
    message: "Provide frontmatter and/or body to update.",
  });

export const buildArtifactBodySchema = z.object({
  modelId: optionalTrimmedString(160),
});

const elementContextSchema = z.object({
  elementTag: z.string().max(30),
  elementId: z.string().max(200).optional(),
  cssPath: z.string().max(500).optional(),
  elementText: z.string().max(300).optional(),
  elementHTML: z.string().max(1000).optional(),
});

export const regenerateSectionBodySchema = z.object({
  instruction: z.string().trim().min(1).max(10_000),
  modelId: optionalTrimmedString(160),
  elementContext: elementContextSchema.optional(),
});

export const createAnnotationBodySchema = z.object({
  sectionId: z.string().trim().min(1).max(200),
  sectionTitle: z.string().trim().min(1).max(500),
  instruction: z.string().trim().min(1).max(10_000),
  elementContext: elementContextSchema.optional(),
});

export const updateAnnotationBodySchema = z.object({
  instruction: z.string().trim().min(1).max(10_000),
  elementContext: elementContextSchema.optional(),
});

export const addSectionBodySchema = z.object({
  description: z.string().trim().min(1).max(10_000),
  afterSectionId: z.string().trim().max(200).nullable().optional().default(null),
});

function parseRequestPart(schema, value, httpError, label) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const tooLarge = result.error.issues.some((issue) => String(issue.message).toLowerCase().includes("too large"));
  const message = result.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || label}: ${issue.message}`)
    .join("; ");
  throw httpError(`Invalid request ${label}. ${message}`, tooLarge ? 413 : 400, tooLarge ? "request_too_large" : "invalid_request");
}

export function parseRequestBody(schema, body, httpError) {
  return parseRequestPart(schema, body, httpError, "body");
}

export function parseRequestParams(schema, params, httpError) {
  return parseRequestPart(schema, params, httpError, "params");
}

export function parseRequestQuery(schema, query, httpError) {
  return parseRequestPart(schema, query, httpError, "query");
}
