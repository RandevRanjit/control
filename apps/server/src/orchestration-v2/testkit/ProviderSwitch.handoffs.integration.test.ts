import { describe, it } from "@effect/vitest";
import { handoffScenarios, preservesHandoffsThrough } from "./ProviderSwitch.testkit.ts";

describe("orchestration v2 provider switching", () => {
  it.live.each(handoffScenarios.filter((scenario) => !scenario.includes("prior-images")))(
    "preserves handoffs through %s",
    preservesHandoffsThrough,
  );
});
