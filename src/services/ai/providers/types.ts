import * as vscode from "vscode";
import type { AIModelSelection } from "../types";

export interface AvailableAIModel {
  label: string;
  description?: string;
  detail?: string;
  selection: AIModelSelection;
}

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  listModels?(context: vscode.ExtensionContext): Promise<AvailableAIModel[]>;
  sendPrompt(
    selection: AIModelSelection,
    context: vscode.ExtensionContext,
    prompt: string,
    token: vscode.CancellationToken,
  ): Promise<AsyncIterable<string>>;
}

export interface OpenAICompatibleProviderConfig {
  providerId: string;
  providerName: string;
  baseUrl: string;
  apiKeySecretKey: string;
  requiresApiKey: boolean;
  headers?: Record<string, string>;
}

export interface OpenAICompatibleListedModel {
  id: string;
  label: string;
}
