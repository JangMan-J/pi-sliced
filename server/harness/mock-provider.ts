// Check-only Pi extension: registers the mock model (server/harness/mock-model.ts) as a provider,
// so a session with an empty HOME has a model without credentials or a real provider.
// Loaded with `-e`; the mock's port comes from PI_SLICED_MOCK_PORT.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const port = process.env.PI_SLICED_MOCK_PORT;
  if (!port) throw new Error("mock-provider: PI_SLICED_MOCK_PORT is not set");
  pi.registerProvider("pi-sliced-mock", {
    name: "pi-sliced check mock",
    baseUrl: `http://127.0.0.1:${port}`,
    apiKey: "mock-key-not-a-credential",
    api: "anthropic-messages",
    models: [
      {
        type: "chat",
        id: "mock",
        name: "Mock",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_000_000,
        maxTokens: 8192,
      },
    ],
  });
}
