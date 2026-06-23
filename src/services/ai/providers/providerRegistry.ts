import * as vscode from "vscode";
import type {
  AIModelSelection,
  CopilotModelSelection,
  LegacyCopilotModelSelection,
  OpenAICompatibleModelSelection,
} from "../types";
import { CopilotProvider } from "./copilotProvider";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider";
import type { AIProvider, OpenAICompatibleProviderConfig } from "./types";

export const SELECTED_AI_MODEL_KEY = "selectedAIModel";
export const LEGACY_SELECTED_MODEL_KEY = "selectedModel";
export const CONFIGURED_EXTERNAL_MODELS_KEY = "configuredExternalModels";

export const DEFAULT_COPILOT_SELECTION: CopilotModelSelection = {
  type: "copilot",
  vendor: "copilot",
  family: "gpt-4o",
  label: "Copilot / GPT-4o",
};

export const OPENAI_PROVIDER_CONFIG: OpenAICompatibleProviderConfig = {
  providerId: "openai",
  providerName: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  apiKeySecretKey: "splitify.provider.openai.apiKey",
  requiresApiKey: true,
};

export const OPENROUTER_PROVIDER_CONFIG: OpenAICompatibleProviderConfig = {
  providerId: "openrouter",
  providerName: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKeySecretKey: "splitify.provider.openrouter.apiKey",
  requiresApiKey: true,
  headers: {
    "X-Title": "Splitify",
  },
};

export const OPENAI_COMPATIBLE_PROVIDER_CONFIGS = [
  OPENAI_PROVIDER_CONFIG,
  OPENROUTER_PROVIDER_CONFIG,
];

export function getSelectedAIModelSelection(
  context: vscode.ExtensionContext,
): AIModelSelection {
  const selected = context.globalState.get<unknown>(SELECTED_AI_MODEL_KEY);
  if (isAIModelSelection(selected)) {
    return selected;
  }

  const legacy = context.globalState.get<unknown>(LEGACY_SELECTED_MODEL_KEY);
  if (isLegacyCopilotSelection(legacy)) {
    return {
      type: "copilot",
      vendor: legacy.vendor,
      family: legacy.family,
      label: `${legacy.vendor}/${legacy.family}`,
    };
  }

  return DEFAULT_COPILOT_SELECTION;
}

export async function persistSelectedAIModelSelection(
  context: vscode.ExtensionContext,
  selection: AIModelSelection,
): Promise<void> {
  await context.globalState.update(SELECTED_AI_MODEL_KEY, selection);

  if (selection.type === "copilot") {
    await context.globalState.update(LEGACY_SELECTED_MODEL_KEY, {
      vendor: selection.vendor,
      family: selection.family,
    });
  }

  if (selection.type === "openai-compatible") {
    await rememberConfiguredExternalModel(context, selection);
  }
}

export function getConfiguredExternalModels(
  context: vscode.ExtensionContext,
): OpenAICompatibleModelSelection[] {
  const configured = context.globalState.get<unknown>(
    CONFIGURED_EXTERNAL_MODELS_KEY,
  );

  if (!Array.isArray(configured)) {
    return [];
  }

  return configured.filter(isOpenAICompatibleSelection);
}

export async function rememberConfiguredExternalModel(
  context: vscode.ExtensionContext,
  selection: OpenAICompatibleModelSelection,
): Promise<void> {
  const configured = getConfiguredExternalModels(context);
  const withoutDuplicate = configured.filter(
    (model) => !isSameAIModelSelection(model, selection),
  );

  await context.globalState.update(CONFIGURED_EXTERNAL_MODELS_KEY, [
    selection,
    ...withoutDuplicate,
  ]);
}

export async function updateConfiguredExternalModels(
  context: vscode.ExtensionContext,
  predicate: (selection: OpenAICompatibleModelSelection) => boolean,
  update: (
    selection: OpenAICompatibleModelSelection,
  ) => OpenAICompatibleModelSelection,
): Promise<OpenAICompatibleModelSelection[]> {
  const updated = getConfiguredExternalModels(context).map((selection) =>
    predicate(selection) ? update(selection) : selection,
  );

  await context.globalState.update(CONFIGURED_EXTERNAL_MODELS_KEY, updated);

  const selected = getSelectedAIModelSelection(context);
  if (selected.type === "openai-compatible" && predicate(selected)) {
    await context.globalState.update(SELECTED_AI_MODEL_KEY, update(selected));
  }

  return updated;
}

export async function removeConfiguredExternalModels(
  context: vscode.ExtensionContext,
  predicate: (selection: OpenAICompatibleModelSelection) => boolean,
): Promise<OpenAICompatibleModelSelection[]> {
  const remaining = getConfiguredExternalModels(context).filter(
    (selection) => !predicate(selection),
  );

  await context.globalState.update(CONFIGURED_EXTERNAL_MODELS_KEY, remaining);

  const selected = getSelectedAIModelSelection(context);
  if (selected.type === "openai-compatible" && predicate(selected)) {
    await persistSelectedAIModelSelection(context, DEFAULT_COPILOT_SELECTION);
  }

  return remaining;
}

export function getProviderForSelection(
  selection: AIModelSelection,
): AIProvider {
  if (selection.type === "copilot") {
    return new CopilotProvider();
  }

  return new OpenAICompatibleProvider();
}

export function isSameAIModelSelection(
  a: AIModelSelection,
  b: AIModelSelection,
): boolean {
  if (a.type !== b.type) {
    return false;
  }

  if (a.type === "copilot" && b.type === "copilot") {
    return a.vendor === b.vendor && a.family === b.family;
  }

  if (a.type === "openai-compatible" && b.type === "openai-compatible") {
    return (
      normalizeBaseUrl(a.baseUrl) === normalizeBaseUrl(b.baseUrl) &&
      a.modelId === b.modelId
    );
  }

  return false;
}

export function buildOpenAICompatibleSelection(
  providerConfig: OpenAICompatibleProviderConfig,
  modelId: string,
): OpenAICompatibleModelSelection {
  return {
    type: "openai-compatible",
    providerId: providerConfig.providerId,
    providerName: providerConfig.providerName,
    baseUrl: providerConfig.baseUrl,
    modelId,
    apiKeySecretKey: providerConfig.apiKeySecretKey,
    requiresApiKey: providerConfig.requiresApiKey,
    label: `${providerConfig.providerName} / ${modelId}`,
    headers: providerConfig.headers,
  };
}

export function buildCustomOpenAICompatibleConfig(
  providerName: string,
  baseUrl: string,
): OpenAICompatibleProviderConfig {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const slug =
    providerName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "custom";
  const providerId = `custom-${slug}-${hashString(normalizedBaseUrl)}`;

  return {
    providerId,
    providerName,
    baseUrl: normalizedBaseUrl,
    apiKeySecretKey: `splitify.provider.${providerId}.apiKey`,
    requiresApiKey: false,
  };
}

export function isSameOpenAICompatibleProvider(
  a: OpenAICompatibleModelSelection,
  b: OpenAICompatibleModelSelection,
): boolean {
  return normalizeBaseUrl(a.baseUrl) === normalizeBaseUrl(b.baseUrl);
}

export function isAIModelSelection(value: unknown): value is AIModelSelection {
  return isCopilotSelection(value) || isOpenAICompatibleSelection(value);
}

function isCopilotSelection(value: unknown): value is CopilotModelSelection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CopilotModelSelection>;
  return (
    candidate.type === "copilot" &&
    typeof candidate.vendor === "string" &&
    typeof candidate.family === "string"
  );
}

function isLegacyCopilotSelection(
  value: unknown,
): value is LegacyCopilotModelSelection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LegacyCopilotModelSelection>;
  return (
    typeof candidate.vendor === "string" && typeof candidate.family === "string"
  );
}

function isOpenAICompatibleSelection(
  value: unknown,
): value is OpenAICompatibleModelSelection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<OpenAICompatibleModelSelection>;
  return (
    candidate.type === "openai-compatible" &&
    typeof candidate.providerId === "string" &&
    typeof candidate.providerName === "string" &&
    typeof candidate.baseUrl === "string" &&
    typeof candidate.modelId === "string" &&
    typeof candidate.apiKeySecretKey === "string" &&
    typeof candidate.requiresApiKey === "boolean"
  );
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  return hash.toString(36);
}
