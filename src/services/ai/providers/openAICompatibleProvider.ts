import * as vscode from "vscode";
import { TextDecoder } from "util";
import type {
  AIModelSelection,
  OpenAICompatibleModelSelection,
} from "../types";
import type {
  AIProvider,
  OpenAICompatibleListedModel,
  OpenAICompatibleProviderConfig,
} from "./types";

interface OpenAIModelsResponse {
  data?: Array<{ id?: unknown }>;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: { content?: unknown };
    delta?: { content?: unknown };
  }>;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id = "openai-compatible";
  readonly label = "OpenAI-compatible";

  async sendPrompt(
    selection: AIModelSelection,
    context: vscode.ExtensionContext,
    prompt: string,
    token: vscode.CancellationToken,
  ): Promise<AsyncIterable<string>> {
    if (selection.type !== "openai-compatible") {
      throw new Error("Invalid model selection for OpenAI-compatible provider");
    }

    const apiKey = await context.secrets.get(selection.apiKeySecretKey);
    if (selection.requiresApiKey && !apiKey) {
      throw new Error(
        `No API key configured for ${selection.providerName}. Run "Splitify: Select AI Model" to configure one.`,
      );
    }

    return streamOpenAICompatibleChatCompletion(
      selection,
      apiKey,
      prompt,
      token,
    );
  }
}

export async function listOpenAICompatibleModels(
  providerConfig: OpenAICompatibleProviderConfig,
  apiKey: string | undefined,
): Promise<OpenAICompatibleListedModel[]> {
  if (providerConfig.requiresApiKey && !apiKey) {
    throw new Error(`No API key configured for ${providerConfig.providerName}`);
  }

  const response = await fetch(
    buildProviderUrl(providerConfig.baseUrl, "models"),
    {
      method: "GET",
      headers: buildHeaders(apiKey, providerConfig.headers),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to list ${providerConfig.providerName} models: ${response.status} ${await readResponseText(response)}`,
    );
  }

  const parsed = (await response.json()) as OpenAIModelsResponse;
  if (!Array.isArray(parsed.data)) {
    throw new Error(
      `Failed to list ${providerConfig.providerName} models: invalid response`,
    );
  }

  return parsed.data
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .map((id) => ({ id, label: id }));
}

export async function* streamOpenAICompatibleChatCompletion(
  selection: OpenAICompatibleModelSelection,
  apiKey: string | undefined,
  prompt: string,
  token: vscode.CancellationToken,
): AsyncIterable<string> {
  const controller = new AbortController();
  const cancellation = token.onCancellationRequested(() => controller.abort());

  try {
    const response = await fetch(
      buildProviderUrl(selection.baseUrl, "chat/completions"),
      {
        method: "POST",
        headers: buildHeaders(apiKey, selection.headers),
        body: JSON.stringify({
          model: selection.modelId,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(
        `${selection.providerName} request failed: ${response.status} ${await readResponseText(response)}`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.body || !contentType.includes("text/event-stream")) {
      const parsed = (await response.json()) as OpenAIChatCompletionResponse;
      const content = extractOpenAICompatibleContent(parsed);
      if (content) {
        yield content;
      }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (!token.isCancellationRequested) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parsed = parseOpenAICompatibleSSE(buffer);
      buffer = parsed.remaining;

      for (const chunk of parsed.chunks) {
        yield chunk;
      }

      if (parsed.done) {
        break;
      }
    }
  } finally {
    cancellation.dispose();
  }
}

export function parseOpenAICompatibleSSE(input: string): {
  chunks: string[];
  done: boolean;
  remaining: string;
} {
  const chunks: string[] = [];
  let remaining = input;
  let done = false;

  while (true) {
    const separator = remaining.match(/\r?\n\r?\n/);
    if (!separator || separator.index === undefined) {
      break;
    }

    const rawEvent = remaining.slice(0, separator.index);
    remaining = remaining.slice(separator.index + separator[0].length);

    for (const line of rawEvent.split(/\r?\n/)) {
      if (!line.startsWith("data:")) {
        continue;
      }

      const data = line.slice("data:".length).trim();
      if (data === "[DONE]") {
        done = true;
        continue;
      }

      try {
        const parsed = JSON.parse(data) as OpenAIChatCompletionResponse;
        const content = extractOpenAICompatibleContent(parsed);
        if (content) {
          chunks.push(content);
        }
      } catch {
        // Ignore malformed partial events and keep parsing later events.
      }
    }
  }

  return { chunks, done, remaining };
}

function buildProviderUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function buildHeaders(
  apiKey: string | undefined,
  extraHeaders: Record<string, string> | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extraHeaders ?? {}),
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function extractOpenAICompatibleContent(
  parsed: OpenAIChatCompletionResponse,
): string | undefined {
  const firstChoice = parsed.choices?.[0];
  const deltaContent = firstChoice?.delta?.content;
  if (typeof deltaContent === "string") {
    return deltaContent;
  }

  const messageContent = firstChoice?.message?.content;
  if (typeof messageContent === "string") {
    return messageContent;
  }

  return undefined;
}

async function readResponseText(response: { text(): Promise<string> }) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
