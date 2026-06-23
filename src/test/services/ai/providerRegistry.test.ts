import * as assert from "assert";
import * as vscode from "vscode";
import {
  buildCustomOpenAICompatibleConfig,
  buildOpenAICompatibleSelection,
  CONFIGURED_EXTERNAL_MODELS_KEY,
  DEFAULT_COPILOT_SELECTION,
  getConfiguredExternalModels,
  getSelectedAIModelSelection,
  isSameOpenAICompatibleProvider,
  isSameAIModelSelection,
  LEGACY_SELECTED_MODEL_KEY,
  OPENROUTER_PROVIDER_CONFIG,
  persistSelectedAIModelSelection,
  removeConfiguredExternalModels,
  SELECTED_AI_MODEL_KEY,
} from "../../../services/ai/providers/providerRegistry";
import type { AIModelSelection } from "../../../services/ai/types";

suite("AI provider registry", () => {
  test("uses Copilot GPT-4o by default", () => {
    const { context } = createMockContext();

    const selection = getSelectedAIModelSelection(context);

    assert.deepStrictEqual(selection, DEFAULT_COPILOT_SELECTION);
  });

  test("reads legacy Copilot model selection", () => {
    const { context, storage } = createMockContext();
    storage.set(LEGACY_SELECTED_MODEL_KEY, {
      vendor: "copilot",
      family: "claude-3.5-sonnet",
    });

    const selection = getSelectedAIModelSelection(context);

    assert.strictEqual(selection.type, "copilot");
    assert.strictEqual(selection.vendor, "copilot");
    assert.strictEqual(selection.family, "claude-3.5-sonnet");
  });

  test("persists external model metadata without API keys", async () => {
    const { context, storage } = createMockContext();
    const selection = buildOpenAICompatibleSelection(
      OPENROUTER_PROVIDER_CONFIG,
      "openai/gpt-4o",
    );

    await persistSelectedAIModelSelection(context, selection);

    const persisted = storage.get(SELECTED_AI_MODEL_KEY) as AIModelSelection;
    assert.strictEqual(persisted.type, "openai-compatible");
    assert.strictEqual(persisted.modelId, "openai/gpt-4o");
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(persisted, "apiKey"),
      false,
    );

    const configured = getConfiguredExternalModels(context);
    assert.strictEqual(configured.length, 1);
    assert.strictEqual(
      configured[0].apiKeySecretKey,
      selection.apiKeySecretKey,
    );
    assert.ok(storage.has(CONFIGURED_EXTERNAL_MODELS_KEY));
  });

  test("builds stable custom provider config for the same name and URL", () => {
    const first = buildCustomOpenAICompatibleConfig(
      "Ollama Cloud",
      "https://ollama.com/v1/",
    );
    const second = buildCustomOpenAICompatibleConfig(
      "Ollama Cloud",
      "https://ollama.com/v1",
    );

    assert.strictEqual(first.providerId, second.providerId);
    assert.strictEqual(first.apiKeySecretKey, second.apiKeySecretKey);
    assert.strictEqual(first.baseUrl, "https://ollama.com/v1");
  });

  test("dedupes external models by base URL and model id", async () => {
    const { context } = createMockContext();
    const oldSelection = buildOpenAICompatibleSelection(
      {
        providerId: "custom-old-123",
        providerName: "Ollama Cloud",
        baseUrl: "https://ollama.com/v1",
        apiKeySecretKey: "splitify.provider.custom-old-123.apiKey",
        requiresApiKey: true,
      },
      "llama3.3",
    );
    const newSelection = buildOpenAICompatibleSelection(
      buildCustomOpenAICompatibleConfig(
        "Ollama Cloud",
        "https://ollama.com/v1",
      ),
      "llama3.3",
    );

    await persistSelectedAIModelSelection(context, oldSelection);
    await persistSelectedAIModelSelection(context, newSelection);

    const configured = getConfiguredExternalModels(context);
    assert.strictEqual(configured.length, 1);
    assert.ok(isSameAIModelSelection(configured[0], newSelection));
  });

  test("treats external providers with the same base URL as the same endpoint", () => {
    const first = buildOpenAICompatibleSelection(
      buildCustomOpenAICompatibleConfig("ollama", "https://ollama.com/v1"),
      "llama3.3",
    );
    const second = buildOpenAICompatibleSelection(
      buildCustomOpenAICompatibleConfig(
        "Ollama Cloud",
        "https://ollama.com/v1/",
      ),
      "llama3.1",
    );

    assert.ok(isSameOpenAICompatibleProvider(first, second));
  });

  test("removes configured external models and resets selected model", async () => {
    const { context } = createMockContext();
    const selection = buildOpenAICompatibleSelection(
      buildCustomOpenAICompatibleConfig(
        "Ollama Cloud",
        "https://ollama.com/v1",
      ),
      "llama3.3",
    );
    await persistSelectedAIModelSelection(context, selection);

    await removeConfiguredExternalModels(
      context,
      (configured) => configured.providerName === "Ollama Cloud",
    );

    assert.strictEqual(getConfiguredExternalModels(context).length, 0);
    assert.deepStrictEqual(
      getSelectedAIModelSelection(context),
      DEFAULT_COPILOT_SELECTION,
    );
  });
});

function createMockContext(): {
  context: vscode.ExtensionContext;
  storage: Map<string, unknown>;
} {
  const storage = new Map<string, unknown>();
  const globalState = {
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      storage.has(key) ? (storage.get(key) as T) : defaultValue,
    update: async (key: string, value: unknown) => {
      if (value === undefined) {
        storage.delete(key);
      } else {
        storage.set(key, value);
      }
    },
    keys: () => [...storage.keys()],
    setKeysForSync: () => {},
  } as unknown as vscode.Memento & {
    setKeysForSync(keys: readonly string[]): void;
  };

  return {
    context: { globalState } as unknown as vscode.ExtensionContext,
    storage,
  };
}
