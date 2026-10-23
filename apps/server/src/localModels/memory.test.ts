import { formatGb, GB, LOCAL_MODEL_KEEP_BYTES } from "@control/contracts";
import { describe, expect, it } from "vite-plus/test";

import { darwinAvailableMemory } from "../resourceTelemetry/HostResources.ts";
import { estimateNeedBytes, parseFootprint, parseSwapUsed, wakeVerdict } from "./memory.ts";

// Captured on an M4 Max, 13 Oct 2026.
const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                  5654677.
Pages active:                                1193937.
Pages inactive:                              1101755.
Pages speculative:                            107801.
Pages throttled:                                    0.
Pages wired down:                             280520.
Pages purgeable:                              108485.
`;
const FOOTPRINT = `======================================================================
llama-server [64723]: 64-bit    Footprint: 35433480192 B (16384 bytes per page)
======================================================================

Auxiliary data:
    phys_footprint: 35433480192 B
    phys_footprint_peak: 35610173440 B
`;

describe("reading the Mac's memory", () => {
  it("counts free, inactive and speculative pages as available", () => {
    expect(darwinAvailableMemory(VM_STAT)).toBe((5654677 + 1101755 + 107801) * 16384);
  });

  it("reads the swap in use, in sysctl's units", () => {
    expect(parseSwapUsed("total = 0.00M  used = 0.00M  free = 0.00M  (encrypted)")).toBe(0);
    expect(parseSwapUsed("total = 3072.00M  used = 2150.40M  free = 921.60M  (encrypted)")).toBe(
      Math.round(2150.4 * 1024 ** 2),
    );
    expect(parseSwapUsed("total = 4.00G  used = 1.50G  free = 2.50G")).toBe(1.5 * GB);
    expect(parseSwapUsed("vm.swapusage: unknown")).toBeNull();
  });

  it("reads a process's footprint, Metal's allocations included", () => {
    expect(parseFootprint(FOOTPRINT)).toBe(35433480192);
    expect(parseFootprint("footprint: no process found")).toBeNull();
  });
});

describe("what a first wake needs", () => {
  it("adds the files and the prompt cache --cache-ram allows", () => {
    const files = { fileBytes: 16 * GB, projectorBytes: 1 * GB };
    expect(estimateNeedBytes({ ...files, args: ["llama-server", "-c", "32768"] })).toBe(17 * GB);
    expect(estimateNeedBytes({ ...files, args: ["llama-server", "--cache-ram", "8192"] })).toBe(
      25 * GB,
    );
    // -1 lifts the limit, which gives nothing to count.
    expect(estimateNeedBytes({ ...files, args: ["llama-server", "--cache-ram", "-1"] })).toBe(
      17 * GB,
    );
  });
});

describe("the wake rule", () => {
  const memory = (availableGb: number, swapUsedBytes = 0) => ({
    totalBytes: 128 * GB,
    availableBytes: availableGb * GB,
    keepBytes: LOCAL_MODEL_KEEP_BYTES,
    swapUsedBytes,
  });

  it.each([
    { case: "fits", available: 90, need: 33, approved: false, verdict: { _tag: "wake" } },
    {
      case: "leaves exactly 15 GB",
      available: 48,
      need: 33,
      approved: false,
      verdict: { _tag: "wake" },
    },
    {
      case: "would leave under 15 GB",
      available: 46,
      need: 42,
      approved: true,
      verdict: { _tag: "refuse", meta: "needs 42 GB · 31 GB to spare" },
    },
    {
      case: "has nothing to spare",
      available: 12,
      need: 5,
      approved: false,
      verdict: { _tag: "refuse", meta: "needs 5 GB · 0 GB to spare" },
    },
    {
      case: "is over 40 GB",
      available: 87,
      need: 42,
      approved: false,
      verdict: { _tag: "ask", needBytes: 42 * GB, freeAfterBytes: 45 * GB },
    },
    {
      case: "is over 40 GB, approved",
      available: 87,
      need: 42,
      approved: true,
      verdict: { _tag: "wake" },
    },
    {
      case: "is exactly 40 GB",
      available: 87,
      need: 40,
      approved: false,
      verdict: { _tag: "wake" },
    },
  ])("a wake that $case", ({ available, need, approved, verdict }) => {
    expect(wakeVerdict({ memory: memory(available), needBytes: need * GB, approved })).toEqual(
      verdict,
    );
  });

  it("refuses any wake while the Mac is using swap, approved or not", () => {
    expect(
      wakeVerdict({ memory: memory(100, 2.1 * GB), needBytes: 5 * GB, approved: true }),
    ).toEqual({ _tag: "refuse", meta: "swap in use · 2.1 GB" });
  });

  it("prints memory the way the notes do", () => {
    expect(formatGb(2.1 * GB)).toBe("2.1 GB");
    expect(formatGb(0)).toBe("0 GB");
    expect(formatGb(33.4 * GB)).toBe("33 GB");
  });
});
