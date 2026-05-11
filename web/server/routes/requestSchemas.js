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

const contextRefSchema = z.object({
  path: z.string().trim().min(1).max(300),
  label: optionalTrimmedString(160),
  kind: optionalTrimmedString(40),
});

const agentContextFileSchema = contextRefSchema.extend({
  editable: z.boolean().optional(),
  annotation: z.boolean().optional(),
  contentHash: optionalTrimmedString(160),
  draftContent: z.string().max(120_000).optional(),
  draftState: z.enum(["saved", "unsaved", "unknown"]).optional(),
  role: z.enum(["primary", "secondary"]).optional(),
});

const chatContextSchema = z.object({
  currentFile: agentContextFileSchema.optional(),
  editableFiles: z.array(agentContextFileSchema).max(10).optional(),
  sourceFiles: z.array(contextRefSchema).max(20).optional(),
  activeFiles: z.array(agentContextFileSchema).max(10).optional(),
  fileRefs: z.array(contextRefSchema).max(20).optional(),
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

export const updateConversationBodySchema = z.object({
  title: optionalTrimmedString(120),
  summary: optionalTrimmedString(500),
  archived: z.boolean().optional(),
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

export const writeFileBodySchema = filePathBodySchema.extend({
  content: maxUtf8Bytes(MAX_WRITE_FILE_BYTES, "File content is too large."),
  expectedContentHash: z.string().trim().min(1).max(160),
});

export const treeSectionParamsSchema = z.object({
  section: z.enum(["requirements", "human", "inputs-ai", "outputs", "logs"]),
});

export const filePathQuerySchema = z.object({
  path: optionalQueryString(1_000).pipe(z.string().min(1)),
});

export const searchFilesQuerySchema = z.object({
  q: optionalQueryString(300),
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
