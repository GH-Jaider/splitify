import * as vscode from "vscode";
import type {
  AIModelSelection,
  OpenAICompatibleModelSelection,
} from "../services/ai/types";
import { CopilotProvider } from "../services/ai/providers/copilotProvider";
import { listOpenAICompatibleModels } from "../services/ai/providers/openAICompatibleProvider";
import type {
  AvailableAIModel,
  OpenAICompatibleProviderConfig,
} from "../services/ai/providers/types";
import {
  buildCustomOpenAICompatibleConfig,
  buildOpenAICompatibleSelection,
  getConfiguredExternalModels,
  getSelectedAIModelSelection,
  isSameOpenAICompatibleProvider,
  isSameAIModelSelection,
  OPENAI_PROVIDER_CONFIG,
  OPENROUTER_PROVIDER_CONFIG,
  persistSelectedAIModelSelection,
  removeConfiguredExternalModels,
  updateConfiguredExternalModels,
} from "../services/ai/providers/providerRegistry";

type SelectModelAction =
  | "configure-openai"
  | "configure-openrouter"
  | "configure-custom"
  | "manage-external-providers";

type ExternalProviderManageAction = "update-api-key" | "remove-provider";

interface ModelQuickPickItem extends vscode.QuickPickItem {
  _selection?: AIModelSelection;
  _action?: SelectModelAction;
}

interface ExternalModelQuickPickItem extends vscode.QuickPickItem {
  _modelId?: string;
  _manual?: boolean;
}

interface ExternalProviderQuickPickItem extends vscode.QuickPickItem {
  _selection: OpenAICompatibleModelSelection;
  _secretKeys: string[];
  _modelCount: number;
}

interface ExternalProviderActionQuickPickItem extends vscode.QuickPickItem {
  _action: ExternalProviderManageAction;
}

/**
 * Command: Select or configure the AI model for Splitify.
 */
export function createSelectModelCommand(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.commands.registerCommand("splitify.selectModel", async () => {
    const current = getSelectedAIModelSelection(context);
    const availableModels = await loadAvailableModels(context, current);
    const items = buildModelQuickPickItems(availableModels, current);

    const selected = await vscode.window.showQuickPick(items, {
      title: "Splitify: Select AI Model",
      placeHolder: "Select a model or configure an external provider",
    });

    if (!selected) {
      return;
    }

    if (selected._selection) {
      await persistSelectedAIModelSelection(context, selected._selection);
      vscode.window.showInformationMessage(
        `Splitify will now use ${getSelectionLabel(selected._selection)}`,
      );
      return;
    }

    await runAction(context, selected._action);
  });
}

export function buildModelQuickPickItems(
  availableModels: AvailableAIModel[],
  current: AIModelSelection,
): ModelQuickPickItem[] {
  const modelItems = availableModels.map((model) => {
    const isCurrent = isSameAIModelSelection(model.selection, current);
    return {
      label: isCurrent ? `$(check) ${model.label}` : model.label,
      description: isCurrent
        ? `${model.description ?? ""} (current)`.trim()
        : model.description,
      detail: model.detail,
      _selection: model.selection,
    };
  });

  const currentItem = modelItems.find((item) =>
    item._selection ? isSameAIModelSelection(item._selection, current) : false,
  );
  const otherItems = modelItems.filter((item) =>
    item._selection ? !isSameAIModelSelection(item._selection, current) : true,
  );

  const finalItems: ModelQuickPickItem[] = [];
  if (currentItem) {
    finalItems.push(currentItem);
    if (otherItems.length > 0) {
      finalItems.push(separator("Other models"));
      finalItems.push(...otherItems);
    }
  } else {
    finalItems.push(...otherItems);
  }

  if (finalItems.length > 0) {
    finalItems.push(separator("Provider setup"));
  }

  finalItems.push(
    {
      label: "Configure OpenAI...",
      description: "Official API",
      detail: "Uses https://api.openai.com/v1",
      _action: "configure-openai",
    },
    {
      label: "Configure OpenRouter...",
      description: "Known compatible endpoint",
      detail: "Uses https://openrouter.ai/api/v1 with OpenRouter headers",
      _action: "configure-openrouter",
    },
    {
      label: "Add Custom Compatible Endpoint...",
      description: "Ollama Cloud, Groq, Together, LM Studio, etc.",
      detail: "Use any provider that supports the OpenAI chat completions API",
      _action: "configure-custom",
    },
    {
      label: "Manage External Providers...",
      description: "Update API keys or remove saved endpoints",
      _action: "manage-external-providers",
    },
  );

  return finalItems;
}

async function loadAvailableModels(
  context: vscode.ExtensionContext,
  current: AIModelSelection,
): Promise<AvailableAIModel[]> {
  const models: AvailableAIModel[] = [];

  try {
    models.push(...(await new CopilotProvider().listModels()));
  } catch (error) {
    console.warn("Splitify: failed to list Copilot models", error);
  }

  for (const selection of getConfiguredExternalModels(context)) {
    models.push(toAvailableExternalModel(selection));
  }

  if (
    current.type === "openai-compatible" &&
    !models.some((model) => isSameAIModelSelection(model.selection, current))
  ) {
    models.unshift(toAvailableExternalModel(current));
  }

  return dedupeAvailableModels(models);
}

async function runAction(
  context: vscode.ExtensionContext,
  action: SelectModelAction | undefined,
): Promise<void> {
  switch (action) {
    case "configure-openai":
      await configureKnownProvider(context, OPENAI_PROVIDER_CONFIG);
      return;
    case "configure-openrouter":
      await configureKnownProvider(context, OPENROUTER_PROVIDER_CONFIG);
      return;
    case "configure-custom":
      await configureCustomProvider(context);
      return;
    case "manage-external-providers":
      await manageExternalProviders(context);
      return;
    default:
      return;
  }
}

async function configureKnownProvider(
  context: vscode.ExtensionContext,
  providerConfig: OpenAICompatibleProviderConfig,
): Promise<void> {
  const existingKey = await context.secrets.get(providerConfig.apiKeySecretKey);
  const apiKeyInput = await vscode.window.showInputBox({
    title: `Splitify: Configure ${providerConfig.providerName}`,
    prompt: existingKey
      ? "Enter a new API key, or leave empty to keep the existing key."
      : `Enter your ${providerConfig.providerName} API key.`,
    password: true,
    ignoreFocusOut: true,
  });

  if (apiKeyInput === undefined) {
    return;
  }

  const trimmedApiKey = apiKeyInput.trim();
  if (trimmedApiKey) {
    await context.secrets.store(providerConfig.apiKeySecretKey, trimmedApiKey);
  } else if (providerConfig.requiresApiKey && !existingKey) {
    vscode.window.showWarningMessage(
      `${providerConfig.providerName} requires an API key before selecting a model.`,
    );
    return;
  }

  const selection = await pickOpenAICompatibleModel(context, providerConfig);
  if (!selection) {
    return;
  }

  await persistSelectedAIModelSelection(context, selection);
  vscode.window.showInformationMessage(
    `Splitify will now use ${getSelectionLabel(selection)}`,
  );
}

async function configureCustomProvider(
  context: vscode.ExtensionContext,
): Promise<void> {
  const providerName = await vscode.window.showInputBox({
    title: "Splitify: Add Custom Provider",
    prompt: "Provider display name",
    placeHolder: "Ollama Cloud",
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().length > 0 ? undefined : "Enter a provider name",
  });

  if (!providerName) {
    return;
  }

  const baseUrl = await vscode.window.showInputBox({
    title: "Splitify: Add Custom Provider",
    prompt:
      "OpenAI-compatible base URL. Include /v1 if your provider requires it.",
    placeHolder: "https://api.example.com/v1",
    ignoreFocusOut: true,
    validateInput: (value) =>
      /^https?:\/\//.test(value.trim())
        ? undefined
        : "Enter a URL starting with http:// or https://",
  });

  if (!baseUrl) {
    return;
  }

  const apiKeyInput = await vscode.window.showInputBox({
    title: "Splitify: Add Custom Provider",
    prompt: "API key. Leave empty if this provider does not require one.",
    password: true,
    ignoreFocusOut: true,
  });

  if (apiKeyInput === undefined) {
    return;
  }

  const providerConfig = buildCustomOpenAICompatibleConfig(
    providerName.trim(),
    baseUrl.trim().replace(/\/+$/, ""),
  );
  const trimmedApiKey = apiKeyInput.trim();
  const configuredProvider = {
    ...providerConfig,
    requiresApiKey: trimmedApiKey.length > 0,
  };

  if (trimmedApiKey) {
    await context.secrets.store(providerConfig.apiKeySecretKey, trimmedApiKey);
  }

  const selection = await pickOpenAICompatibleModel(
    context,
    configuredProvider,
  );
  if (!selection) {
    return;
  }

  await persistSelectedAIModelSelection(context, selection);
  vscode.window.showInformationMessage(
    `Splitify will now use ${getSelectionLabel(selection)}`,
  );
}

async function pickOpenAICompatibleModel(
  context: vscode.ExtensionContext,
  providerConfig: OpenAICompatibleProviderConfig,
): Promise<OpenAICompatibleModelSelection | undefined> {
  const apiKey = await context.secrets.get(providerConfig.apiKeySecretKey);
  const items: ExternalModelQuickPickItem[] = [];

  try {
    const models = await listOpenAICompatibleModels(providerConfig, apiKey);
    items.push(
      ...models.map((model) => ({
        label: model.label,
        description: providerConfig.providerName,
        _modelId: model.id,
      })),
    );
  } catch (error) {
    console.warn(
      `Splitify: failed to list ${providerConfig.providerName} models`,
      error,
    );
    vscode.window.showWarningMessage(
      `Could not list ${providerConfig.providerName} models. You can enter a model id manually.`,
    );
  }

  if (items.length > 0) {
    items.push({
      label: "Manual model id",
      kind: vscode.QuickPickItemKind.Separator,
    });
  }

  items.push({
    label: "Enter model ID manually...",
    detail:
      "Use this for newly released models or providers without /models support",
    _manual: true,
  });

  const selected = await vscode.window.showQuickPick(items, {
    title: `Splitify: Select ${providerConfig.providerName} Model`,
    placeHolder: "Select a model or enter its id manually",
  });

  if (!selected) {
    return undefined;
  }

  const modelId = selected._manual
    ? await askForModelId(providerConfig.providerName)
    : selected._modelId;

  if (!modelId) {
    return undefined;
  }

  return buildOpenAICompatibleSelection(providerConfig, modelId);
}

async function askForModelId(
  providerName: string,
): Promise<string | undefined> {
  const modelId = await vscode.window.showInputBox({
    title: `Splitify: ${providerName} Model ID`,
    prompt: "Enter the model id exactly as your provider expects it.",
    placeHolder: "gpt-4.1, openai/gpt-4o, llama3.1:70b",
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().length > 0 ? undefined : "Enter a model id",
  });

  return modelId?.trim();
}

async function manageExternalProviders(
  context: vscode.ExtensionContext,
): Promise<void> {
  const providers = await buildExternalProviderManagementItems(context);
  if (providers.length === 0) {
    vscode.window.showInformationMessage(
      "Splitify has no external providers configured.",
    );
    return;
  }

  const selectedProvider = await vscode.window.showQuickPick(providers, {
    title: "Splitify: Manage External Providers",
    placeHolder: "Select a provider to update or remove",
  });

  if (!selectedProvider) {
    return;
  }

  const selectedAction = await vscode.window.showQuickPick(
    buildExternalProviderActionItems(selectedProvider),
    {
      title: `Splitify: ${selectedProvider._selection.providerName}`,
      placeHolder: "Choose what to do with this provider",
    },
  );

  if (!selectedAction) {
    return;
  }

  if (selectedAction._action === "update-api-key") {
    await updateExternalProviderApiKey(context, selectedProvider);
    return;
  }

  await removeExternalProvider(context, selectedProvider);
}

async function buildExternalProviderManagementItems(
  context: vscode.ExtensionContext,
): Promise<ExternalProviderQuickPickItem[]> {
  const configured = getConfiguredExternalModels(context);
  const items: ExternalProviderQuickPickItem[] = [];

  for (const selection of configured) {
    const existing = items.find((item) =>
      isSameOpenAICompatibleProvider(item._selection, selection),
    );

    if (existing) {
      existing._modelCount++;
      if (!existing._secretKeys.includes(selection.apiKeySecretKey)) {
        existing._secretKeys.push(selection.apiKeySecretKey);
      }
      continue;
    }

    items.push({
      label: selection.providerName,
      description: selection.baseUrl,
      _selection: selection,
      _secretKeys: [selection.apiKeySecretKey],
      _modelCount: 1,
    });
  }

  for (const item of items) {
    const hasApiKey = await hasAnyApiKey(context, item._secretKeys);
    item.detail = `${item._modelCount} saved model${item._modelCount === 1 ? "" : "s"} - ${hasApiKey ? "API key configured" : "No API key configured"}`;
  }

  return items;
}

function buildExternalProviderActionItems(
  provider: ExternalProviderQuickPickItem,
): ExternalProviderActionQuickPickItem[] {
  return [
    {
      label: "Update API Key...",
      description: "Store a new key for this provider",
      _action: "update-api-key",
    },
    {
      label: "Remove Provider...",
      description: `Remove ${provider._modelCount} saved model${provider._modelCount === 1 ? "" : "s"} and delete stored keys`,
      _action: "remove-provider",
    },
  ];
}

async function updateExternalProviderApiKey(
  context: vscode.ExtensionContext,
  provider: ExternalProviderQuickPickItem,
): Promise<void> {
  const apiKeyInput = await vscode.window.showInputBox({
    title: `Splitify: Update ${provider._selection.providerName} API Key`,
    prompt: "Enter the API key to use for this provider.",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().length > 0 ? undefined : "Enter an API key",
  });

  if (apiKeyInput === undefined) {
    return;
  }

  const trimmedApiKey = apiKeyInput.trim();
  for (const secretKey of provider._secretKeys) {
    await context.secrets.store(secretKey, trimmedApiKey);
  }

  await updateConfiguredExternalModels(
    context,
    (selection) =>
      isSameOpenAICompatibleProvider(selection, provider._selection),
    (selection) => ({ ...selection, requiresApiKey: true }),
  );

  vscode.window.showInformationMessage(
    `Updated API key for ${provider._selection.providerName}`,
  );
}

async function removeExternalProvider(
  context: vscode.ExtensionContext,
  provider: ExternalProviderQuickPickItem,
): Promise<void> {
  const confirmed = await vscode.window.showWarningMessage(
    `Remove ${provider._selection.providerName} from Splitify? This deletes its saved models and stored API key.`,
    { modal: true },
    "Remove Provider",
  );

  if (confirmed !== "Remove Provider") {
    return;
  }

  for (const secretKey of provider._secretKeys) {
    await context.secrets.delete(secretKey);
  }

  await removeConfiguredExternalModels(context, (selection) =>
    isSameOpenAICompatibleProvider(selection, provider._selection),
  );

  vscode.window.showInformationMessage(
    `Removed ${provider._selection.providerName} from Splitify`,
  );
}

async function hasAnyApiKey(
  context: vscode.ExtensionContext,
  secretKeys: string[],
): Promise<boolean> {
  for (const secretKey of secretKeys) {
    if (await context.secrets.get(secretKey)) {
      return true;
    }
  }

  return false;
}

function toAvailableExternalModel(
  selection: OpenAICompatibleModelSelection,
): AvailableAIModel {
  return {
    label: getSelectionLabel(selection),
    description: selection.providerName,
    detail: selection.baseUrl,
    selection,
  };
}

function dedupeAvailableModels(models: AvailableAIModel[]): AvailableAIModel[] {
  const deduped: AvailableAIModel[] = [];
  for (const model of models) {
    if (
      !deduped.some((existing) =>
        isSameAIModelSelection(existing.selection, model.selection),
      )
    ) {
      deduped.push(model);
    }
  }
  return deduped;
}

function getSelectionLabel(selection: AIModelSelection): string {
  if (selection.type === "copilot") {
    return selection.label || `${selection.vendor}/${selection.family}`;
  }

  return selection.label || `${selection.providerName} / ${selection.modelId}`;
}

function separator(label: string): ModelQuickPickItem {
  return {
    label,
    kind: vscode.QuickPickItemKind.Separator,
  };
}
