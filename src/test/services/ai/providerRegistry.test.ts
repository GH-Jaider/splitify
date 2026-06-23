import * as assert from "assert";
import * as vscode from "vscode";
import {
  buildOpenAICompatibleSelection,
  CONFIGURED_EXTERNAL_MODELS_KEY,
  DEFAULT_COPILOT_SELECTION,
  getConfiguredExternalModels,
  getSelectedAIModelSelection,
  LEGACY_SELECTED_MODEL_KEY,
  OPENROUTER_PROVIDER_CONFIG,
  persistSelectedAIModelSelection,
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
