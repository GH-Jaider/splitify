import * as vscode from "vscode";

/**
 * QuickPick item that carries the underlying model's vendor and family
 */
interface ModelQuickPickItem extends vscode.QuickPickItem {
  _model: { vendor: string; family: string };
}

/**
 * Command: Select the AI language model for Splitify
 * Shows a QuickPick with all available language models and persists the selection
 */
export function createSelectModelCommand(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.commands.registerCommand("splitify.selectModel", async () => {
    const models = await vscode.lm.selectChatModels({});

    if (models.length === 0) {
      vscode.window.showErrorMessage(
        "No language models available. Please ensure GitHub Copilot is installed.",
      );
      return;
    }

    const current = context.globalState.get<{
      vendor: string;
      family: string;
    }>("selectedModel") ?? { vendor: "copilot", family: "gpt-4o" };

    const items: ModelQuickPickItem[] = models.map((model) => {
      const isCurrent =
        current.vendor === model.vendor && current.family === model.family;

      return {
        label: isCurrent
          ? `$(check) ${model.name || `${model.vendor}/${model.family}`}`
          : model.name || `${model.vendor}/${model.family}`,
        description: isCurrent ? `${model.family} (current)` : model.family,
        detail: `Vendor: ${model.vendor} · Max tokens: ${model.maxInputTokens.toLocaleString()}`,
        _model: { vendor: model.vendor, family: model.family },
      };
    });

    // Reorder: current model first, separator, then rest
    const currentItem = items.find(
      (item) =>
        item._model.vendor === current.vendor &&
        item._model.family === current.family,
    );
    const otherItems = items.filter(
      (item) =>
        item._model.vendor !== current.vendor ||
        item._model.family !== current.family,
    );

    const finalItems: ModelQuickPickItem[] = [];
    if (currentItem) {
      finalItems.push(currentItem);
      if (otherItems.length > 0) {
        finalItems.push({
          label: "Other models",
          kind: vscode.QuickPickItemKind.Separator,
          _model: { vendor: "", family: "" },
        } as ModelQuickPickItem);
        finalItems.push(...otherItems);
      }
    } else {
      finalItems.push(...otherItems);
    }

    const selected = await vscode.window.showQuickPick(finalItems, {
      title: "Splitify: Select AI Model",
      placeHolder: "Select a language model for Splitify",
    });

    if (!selected) {
      return;
    }

    await context.globalState.update("selectedModel", {
      vendor: selected._model.vendor,
      family: selected._model.family,
    });

    const displayLabel = selected.label.replace(/^\$\(check\)\s*/, "");
    vscode.window.showInformationMessage(
      `Splitify will now use ${displayLabel}`,
    );
  });
}
