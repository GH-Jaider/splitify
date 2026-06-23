# Plan: Multi-Provider AI Model Support

> Created by: OpenCode
> Date: 2026-06-23

## Scope

### What We're Building

Add AI provider support beyond the VS Code Copilot Language Model API. Copilot remains the default, but users can configure API keys for OpenAI, OpenRouter, or a custom OpenAI-compatible provider such as Ollama Cloud, Groq, Together, DeepSeek, LM Studio, or similar services.

### Non-Goals

- Do not remove Copilot support or change the default model behavior.
- Do not store API keys in VS Code settings or extension global state.
- Do not add native Anthropic API support in this phase; leave it for a later provider adapter.
- Do not change prompt shape or AI response parsing unless provider compatibility requires it.

---

## Architecture

### Components Affected

| Component | Layer | Change Type |
|-----------|-------|-------------|
| `src/services/ai/aiService.ts` | AI orchestration | Modified |
| `src/services/ai/types.ts` | AI data contracts | Modified |
| `src/services/ai/providers/types.ts` | Provider contracts | New |
| `src/services/ai/providers/providerRegistry.ts` | Provider selection | New |
| `src/services/ai/providers/copilotProvider.ts` | Copilot adapter | New |
| `src/services/ai/providers/openAICompatibleProvider.ts` | HTTP provider adapter | New |
| `src/commands/selectModel.ts` | User configuration | Modified |
| `package.json` | VS Code contributions | Modified |
| `README.md` | User documentation | Modified |
| `src/test/**` | Test coverage | Modified/New |

---

## Execution Steps

### Phase 1: Provider Model

1. [ ] Add provider and model selection types.
   - Files: `src/services/ai/types.ts`, `src/services/ai/providers/types.ts`
   - Acceptance: TypeScript can represent Copilot selections, known OpenAI-compatible providers, and custom OpenAI-compatible providers without API keys in persisted state.

2. [ ] Add Copilot provider adapter.
   - Files: `src/services/ai/providers/copilotProvider.ts`
   - Acceptance: Existing `vscode.lm.selectChatModels` behavior remains available through the new provider interface.

3. [ ] Add OpenAI-compatible provider adapter.
   - Files: `src/services/ai/providers/openAICompatibleProvider.ts`
   - Acceptance: Adapter can list `/models` when available and stream `/chat/completions` responses using Server-Sent Events.

4. [ ] Add provider registry and default selection logic.
   - Files: `src/services/ai/providers/providerRegistry.ts`
   - Acceptance: Missing config defaults to Copilot `gpt-4o`; existing legacy `selectedModel` values continue to work.

### Phase 2: Service Refactor

5. [ ] Refactor `AIService` to request text through selected provider.
   - Files: `src/services/ai/aiService.ts`
   - Acceptance: Analyze, streaming analyze, and combined commit message generation work through one provider-agnostic request path.

6. [ ] Preserve parser behavior.
   - Files: `src/services/ai/aiService.ts`
   - Acceptance: Existing JSON and commit-message parsing tests still pass.

### Phase 3: User Configuration

7. [ ] Expand `Splitify: Select AI Model` into provider configuration flow.
   - Files: `src/commands/selectModel.ts`
   - Acceptance: QuickPick shows Copilot models, configured external models, and actions to configure OpenAI, OpenRouter, or custom OpenAI-compatible providers.

8. [ ] Store secrets in VS Code SecretStorage.
   - Files: `src/commands/selectModel.ts`, provider registry/adapter files
   - Acceptance: API keys are stored under `context.secrets`, never in `globalState` or `settings.json`.

9. [ ] Support manual model IDs.
   - Files: `src/commands/selectModel.ts`
   - Acceptance: If listing models fails or the desired model is not listed, the user can type a model id.

### Phase 4: Documentation and Contributions

10. [ ] Update command/settings docs.
    - Files: `package.json`, `README.md`
    - Acceptance: Documentation says Copilot is default and external providers are optional; Copilot is no longer described as an absolute requirement.

### Phase 5: Verification

11. [ ] Add/adjust tests.
    - Files: `src/test/services/ai/aiService.test.ts`, `src/test/commands/selectModel.test.ts`, provider tests as needed
    - Acceptance: Tests cover default Copilot selection, legacy selection compatibility, external selection metadata, missing API key error, and OpenAI-compatible SSE parsing.

12. [ ] Run quality checks.
    - Acceptance: `pnpm run check-types`, `pnpm run lint`, and targeted tests pass or failures are documented.

---

## Testing Strategy

### Required Tests

1. Default selection uses Copilot `gpt-4o` when nothing is configured.
2. Legacy `selectedModel` shape remains readable.
3. External provider selections persist without API keys.
4. OpenAI-compatible stream parsing extracts content chunks.
5. Missing API key produces a clear provider-specific error.
6. Select-model item logic still marks the current model and orders it first.

### What NOT to Test

- Do not make live network calls to OpenAI, OpenRouter, Ollama Cloud, or Copilot.
- Do not test VS Code SecretStorage internals.
- Do not snapshot the full prompt text beyond existing behavioral assertions.

---

## Trade-offs & Constraints

| Decision | Rationale |
|----------|-----------|
| Use OpenAI-compatible adapter first | Covers OpenAI, OpenRouter, Ollama Cloud, Groq, Together, DeepSeek, LM Studio, and similar services with one implementation. |
| Store API keys in `context.secrets` | Avoids leaking secrets through settings sync, source control, or extension global state. |
| Keep Copilot as default | Preserves current behavior and avoids requiring setup for existing users. |
| Defer Anthropic native adapter | Anthropic has a different messages API and can be added cleanly once provider abstraction exists. |
| Allow manual model IDs | Some providers do not expose `/models` reliably or may hide new model ids behind account permissions. |

---

## Handoff

- [x] Architecture is clear
- [x] Execution steps are ordered and verifiable
- [x] Ready for implementation
