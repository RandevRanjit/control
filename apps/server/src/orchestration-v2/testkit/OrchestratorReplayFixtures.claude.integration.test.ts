import { describe, it } from "@effect/vitest";
import { ORCHESTRATOR_REPLAY_FIXTURES } from "./fixtures/index.ts";
import { runFixtureProviderWithRegisteredHarness } from "./OrchestratorReplayFixtures.testkit.ts";

describe("orchestrator replay fixtures", () => {
  it.effect.each(
    ORCHESTRATOR_REPLAY_FIXTURES.filter((fixture) => fixture.name.startsWith("claude_")).flatMap(
      (fixture) =>
        fixture.providers.map(
          (provider) => [fixture.name, provider.driver, fixture, provider] as const,
        ),
    ),
  )("runs %s/%s through OrchestratorV2 using deterministic replay", ([, , fixture, provider]) =>
    runFixtureProviderWithRegisteredHarness({
      fixtureName: fixture.name,
      buildInput: fixture.buildInput,
      driver: provider,
    }),
  );
});
