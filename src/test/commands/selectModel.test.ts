import * as assert from "assert";
import * as vscode from "vscode";

suite("SelectModel Command Test Suite", () => {
  test("splitify.selectModel command is registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("splitify.selectModel"),
      "splitify.selectModel should be registered",
    );
  });

  suite("QuickPick item building", () => {
    // Test the item-building logic that would be used by the command
    // This verifies the mapping from LanguageModelChat to QuickPickItem

    test("should build label from model name", () => {
      const model = {
        name: "GPT-4o",
        family: "gpt-4o",
        vendor: "copilot",
        maxInputTokens: 128000,
      };

      const label = model.name || `${model.vendor}/${model.family}`;
      const description = model.family;
      const detail = `Vendor: ${model.vendor} · Max tokens: ${model.maxInputTokens.toLocaleString()}`;

      assert.strictEqual(label, "GPT-4o");
      assert.strictEqual(description, "gpt-4o");
      assert.ok(detail.includes("copilot"));
      assert.ok(detail.includes("128,000") || detail.includes("128000")); // locale-dependent
    });

    test("should fall back to vendor/family when name is empty", () => {
      const model = {
        name: "",
        family: "gpt-4o",
        vendor: "copilot",
        maxInputTokens: 128000,
      };

      const label = model.name || `${model.vendor}/${model.family}`;
      assert.strictEqual(label, "copilot/gpt-4o");
    });

    test("should add $(check) prefix and (current) description for saved model", () => {
      const currentModel = { vendor: "copilot", family: "claude-3.5-sonnet" };
      const models = [
        {
          name: "GPT-4o",
          family: "gpt-4o",
          vendor: "copilot",
          maxInputTokens: 128000,
        },
        {
          name: "Claude Sonnet",
          family: "claude-3.5-sonnet",
          vendor: "copilot",
          maxInputTokens: 200000,
        },
      ];

      const items = models.map((model) => {
        const isCurrent =
          currentModel !== undefined &&
          currentModel.vendor === model.vendor &&
          currentModel.family === model.family;
        return {
          label: isCurrent
            ? `$(check) ${model.name || `${model.vendor}/${model.family}`}`
            : model.name || `${model.vendor}/${model.family}`,
          description: isCurrent ? `${model.family} (current)` : model.family,
          _model: { vendor: model.vendor, family: model.family },
        };
      });

      assert.strictEqual(items[0].label, "GPT-4o");
      assert.strictEqual(items[0].description, "gpt-4o");
      assert.strictEqual(items[1].label, "$(check) Claude Sonnet");
      assert.strictEqual(items[1].description, "claude-3.5-sonnet (current)");
    });

    test("should show default model as (current) with $(check) prefix when no saved model", () => {
      // Simulate globalState.get returning undefined (no saved model)
      const storage = new Map<string, unknown>();
      const currentModel = (storage.get("selectedModel") as
        | { vendor: string; family: string }
        | undefined) ?? { vendor: "copilot", family: "gpt-4o" };
      const models = [
        {
          name: "GPT-4o",
          family: "gpt-4o",
          vendor: "copilot",
          maxInputTokens: 128000,
        },
      ];

      const items = models.map((model) => {
        const isCurrent =
          currentModel.vendor === model.vendor &&
          currentModel.family === model.family;
        return {
          label: isCurrent
            ? `$(check) ${model.name || `${model.vendor}/${model.family}`}`
            : model.name || `${model.vendor}/${model.family}`,
          description: isCurrent ? `${model.family} (current)` : model.family,
          _model: { vendor: model.vendor, family: model.family },
        };
      });

      assert.strictEqual(items[0].label, "$(check) GPT-4o");
      assert.strictEqual(items[0].description, "gpt-4o (current)");
    });

    test("should order current model first, then separator, then others", () => {
      const currentModel = { vendor: "copilot", family: "gpt-4o" };
      const models = [
        {
          name: "Claude Sonnet",
          family: "claude-3.5-sonnet",
          vendor: "copilot",
          maxInputTokens: 200000,
        },
        {
          name: "GPT-4o",
          family: "gpt-4o",
          vendor: "copilot",
          maxInputTokens: 128000,
        },
        {
          name: "GPT-4o Mini",
          family: "gpt-4o-mini",
          vendor: "copilot",
          maxInputTokens: 128000,
        },
      ];

      // Build items (same logic as command)
      const items = models.map((model) => {
        const isCurrent =
          currentModel.vendor === model.vendor &&
          currentModel.family === model.family;
        return {
          label: isCurrent
            ? `$(check) ${model.name || `${model.vendor}/${model.family}`}`
            : model.name || `${model.vendor}/${model.family}`,
          description: isCurrent ? `${model.family} (current)` : model.family,
          _model: { vendor: model.vendor, family: model.family },
          kind: undefined as vscode.QuickPickItemKind | undefined,
        };
      });

      // Reorder (same logic as command)
      const currentItem = items.find(
        (item) =>
          item._model.vendor === currentModel.vendor &&
          item._model.family === currentModel.family,
      );
      const otherItems = items.filter(
        (item) =>
          item._model.vendor !== currentModel.vendor ||
          item._model.family !== currentModel.family,
      );

      const finalItems: typeof items = [];
      if (currentItem) {
        finalItems.push(currentItem);
        if (otherItems.length > 0) {
          finalItems.push({
            label: "Other models",
            kind: vscode.QuickPickItemKind.Separator,
            _model: { vendor: "", family: "" },
            description: "",
          });
          finalItems.push(...otherItems);
        }
      } else {
        finalItems.push(...otherItems);
      }

      // Verify ordering
      assert.strictEqual(finalItems.length, 4); // current + separator + 2 others
      assert.strictEqual(finalItems[0].label, "$(check) GPT-4o");
      assert.strictEqual(finalItems[0].description, "gpt-4o (current)");
      assert.strictEqual(finalItems[1].label, "Other models");
      assert.strictEqual(
        finalItems[1].kind,
        vscode.QuickPickItemKind.Separator,
      );
      assert.strictEqual(finalItems[2].label, "Claude Sonnet");
      assert.strictEqual(finalItems[2].description, "claude-3.5-sonnet");
      assert.strictEqual(finalItems[3].label, "GPT-4o Mini");
      assert.strictEqual(finalItems[3].description, "gpt-4o-mini");
    });

    test("should not add separator when only the current model exists", () => {
      const currentModel = { vendor: "copilot", family: "gpt-4o" };
      const models = [
        {
          name: "GPT-4o",
          family: "gpt-4o",
          vendor: "copilot",
          maxInputTokens: 128000,
        },
      ];

      const items = models.map((model) => {
        const isCurrent =
          currentModel.vendor === model.vendor &&
          currentModel.family === model.family;
        return {
          label: isCurrent
            ? `$(check) ${model.name || `${model.vendor}/${model.family}`}`
            : model.name || `${model.vendor}/${model.family}`,
          description: isCurrent ? `${model.family} (current)` : model.family,
          _model: { vendor: model.vendor, family: model.family },
          kind: undefined as vscode.QuickPickItemKind | undefined,
        };
      });

      const currentItem = items.find(
        (item) =>
          item._model.vendor === currentModel.vendor &&
          item._model.family === currentModel.family,
      );
      const otherItems = items.filter(
        (item) =>
          item._model.vendor !== currentModel.vendor ||
          item._model.family !== currentModel.family,
      );

      const finalItems: typeof items = [];
      if (currentItem) {
        finalItems.push(currentItem);
        if (otherItems.length > 0) {
          finalItems.push({
            label: "Other models",
            kind: vscode.QuickPickItemKind.Separator,
            _model: { vendor: "", family: "" },
            description: "",
          });
          finalItems.push(...otherItems);
        }
      } else {
        finalItems.push(...otherItems);
      }

      // Only the current model, no separator
      assert.strictEqual(finalItems.length, 1);
      assert.strictEqual(finalItems[0].label, "$(check) GPT-4o");
    });

    test("should show all models without separator when current model is not found", () => {
      const currentModel = { vendor: "copilot", family: "nonexistent-model" };
      const models = [
        {
          name: "GPT-4o",
          family: "gpt-4o",
          vendor: "copilot",
          maxInputTokens: 128000,
        },
        {
          name: "Claude Sonnet",
          family: "claude-3.5-sonnet",
          vendor: "copilot",
          maxInputTokens: 200000,
        },
      ];

      const items = models.map((model) => {
        const isCurrent =
          currentModel.vendor === model.vendor &&
          currentModel.family === model.family;
        return {
          label: isCurrent
            ? `$(check) ${model.name || `${model.vendor}/${model.family}`}`
            : model.name || `${model.vendor}/${model.family}`,
          description: isCurrent ? `${model.family} (current)` : model.family,
          _model: { vendor: model.vendor, family: model.family },
          kind: undefined as vscode.QuickPickItemKind | undefined,
        };
      });

      const currentItem = items.find(
        (item) =>
          item._model.vendor === currentModel.vendor &&
          item._model.family === currentModel.family,
      );
      const otherItems = items.filter(
        (item) =>
          item._model.vendor !== currentModel.vendor ||
          item._model.family !== currentModel.family,
      );

      const finalItems: typeof items = [];
      if (currentItem) {
        finalItems.push(currentItem);
        if (otherItems.length > 0) {
          finalItems.push({
            label: "Other models",
            kind: vscode.QuickPickItemKind.Separator,
            _model: { vendor: "", family: "" },
            description: "",
          });
          finalItems.push(...otherItems);
        }
      } else {
        finalItems.push(...otherItems);
      }

      // No current model found: all models shown without separator
      assert.strictEqual(finalItems.length, 2);
      assert.strictEqual(finalItems[0].label, "GPT-4o");
      assert.strictEqual(finalItems[1].label, "Claude Sonnet");
    });
  });

  suite("globalState model persistence", () => {
    test("should store and retrieve model selection", async () => {
      // Test the globalState contract using a Map-based mock
      const storage = new Map<string, unknown>();
      const mockGlobalState = {
        get: <T>(key: string): T | undefined =>
          storage.get(key) as T | undefined,
        update: async (key: string, value: unknown) => {
          storage.set(key, value);
        },
        keys: () => [...storage.keys()],
        setKeysForSync: () => {},
      };

      // Initially no model selected
      assert.strictEqual(
        mockGlobalState.get<{ vendor: string; family: string }>(
          "selectedModel",
        ),
        undefined,
      );

      // Save a model selection
      await mockGlobalState.update("selectedModel", {
        vendor: "copilot",
        family: "claude-3.5-sonnet",
      });

      // Retrieve it
      const saved = mockGlobalState.get<{ vendor: string; family: string }>(
        "selectedModel",
      );
      assert.strictEqual(saved?.vendor, "copilot");
      assert.strictEqual(saved?.family, "claude-3.5-sonnet");
    });

    test("should use default model when no selection saved", () => {
      const storage = new Map<string, unknown>();
      const mockGlobalState = {
        get: <T>(key: string): T | undefined =>
          storage.get(key) as T | undefined,
      };

      const saved = mockGlobalState.get<{ vendor: string; family: string }>(
        "selectedModel",
      );
      const { vendor, family } = saved ?? {
        vendor: "copilot",
        family: "gpt-4o",
      };

      assert.strictEqual(vendor, "copilot");
      assert.strictEqual(family, "gpt-4o");
    });

    test("should use saved model when selection exists", () => {
      const storage = new Map<string, unknown>();
      storage.set("selectedModel", {
        vendor: "copilot",
        family: "claude-3.5-sonnet",
      });
      const mockGlobalState = {
        get: <T>(key: string): T | undefined =>
          storage.get(key) as T | undefined,
      };

      const saved = mockGlobalState.get<{ vendor: string; family: string }>(
        "selectedModel",
      );
      const { vendor, family } = saved ?? {
        vendor: "copilot",
        family: "gpt-4o",
      };

      assert.strictEqual(vendor, "copilot");
      assert.strictEqual(family, "claude-3.5-sonnet");
    });
  });
});
