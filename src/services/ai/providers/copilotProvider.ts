import * as vscode from "vscode";
import type { AIModelSelection, CopilotModelSelection } from "../types";
import type { AIProvider, AvailableAIModel } from "./types";

export class CopilotProvider implements AIProvider {
  readonly id = "copilot";
  readonly label = "GitHub Copilot";

  async listModels(): Promise<AvailableAIModel[]> {
    const models = await vscode.lm.selectChatModels({});

    return models.map((model) => ({
      label: model.name || `${model.vendor}/${model.family}`,
      description: model.family,
      detail: `Provider: ${model.vendor} - Max tokens: ${model.maxInputTokens.toLocaleString()}`,
      selection: {
        type: "copilot",
        vendor: model.vendor,
        family: model.family,
        label: model.name || `${model.vendor}/${model.family}`,
      },
    }));
  }

  async sendPrompt(
    selection: AIModelSelection,
    _context: vscode.ExtensionContext,
    prompt: string,
    token: vscode.CancellationToken,
  ): Promise<AsyncIterable<string>> {
    if (selection.type !== "copilot") {
      throw new Error("Invalid model selection for Copilot provider");
    }

    const model = await this.selectCopilotModel(selection);
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const response = await model.sendRequest(messages, {}, token);

    return response.text;
  }

  private async selectCopilotModel(
    selection: CopilotModelSelection,
  ): Promise<vscode.LanguageModelChat> {
    const models = await vscode.lm.selectChatModels({
      vendor: selection.vendor,
      family: selection.family,
    });

    if (models.length > 0) {
      return models[0];
    }

    const fallbackModels = await vscode.lm.selectChatModels({
      vendor: "copilot",
    });

    if (fallbackModels.length > 0) {
      vscode.window.showWarningMessage(
        `Splitify: Model "${selection.family}" not available. Using "${fallbackModels[0].name}" instead.`,
      );
      return fallbackModels[0];
    }

    throw new Error(
      "No Copilot model available. Configure an external AI provider or ensure GitHub Copilot is installed and activated.",
    );
  }
}
