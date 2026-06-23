import * as assert from "assert";
import * as vscode from "vscode";
import {
  OpenAICompatibleProvider,
  parseOpenAICompatibleSSE,
} from "../../../services/ai/providers/openAICompatibleProvider";
import {
  buildOpenAICompatibleSelection,
  OPENAI_PROVIDER_CONFIG,
} from "../../../services/ai/providers/providerRegistry";

suite("OpenAI-compatible provider", () => {
  suite("parseOpenAICompatibleSSE", () => {
    test("extracts streamed delta content chunks", () => {
      const parsed = parseOpenAICompatibleSSE(
        'data: {"choices":[{"delta":{"content":"feat"}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":": test"}}]}\n\n' +
          "data: [DONE]\n\n",
      );

      assert.deepStrictEqual(parsed.chunks, ["feat", ": test"]);
      assert.strictEqual(parsed.done, true);
      assert.strictEqual(parsed.remaining, "");
    });

    test("keeps partial events in remaining buffer", () => {
      const parsed = parseOpenAICompatibleSSE(
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n' +
          'data: {"choices":[{"delta"',
      );

      assert.deepStrictEqual(parsed.chunks, ["hello"]);
      assert.strictEqual(parsed.done, false);
      assert.strictEqual(parsed.remaining, 'data: {"choices":[{"delta"');
    });

    test("ignores malformed events and continues parsing", () => {
      const parsed = parseOpenAICompatibleSSE(
        "data: not-json\n\n" +
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      );

      assert.deepStrictEqual(parsed.chunks, ["ok"]);
      assert.strictEqual(parsed.done, false);
    });
  });

  test("fails clearly when required API key is missing", async () => {
    const provider = new OpenAICompatibleProvider();
    const context = {
      secrets: { get: async () => undefined },
    } as unknown as vscode.ExtensionContext;
    const selection = buildOpenAICompatibleSelection(
      OPENAI_PROVIDER_CONFIG,
      "gpt-4.1",
    );
    const token = new vscode.CancellationTokenSource().token;

    await assert.rejects(
      () => provider.sendPrompt(selection, context, "test", token),
      /No API key configured for OpenAI/,
    );
  });
});
