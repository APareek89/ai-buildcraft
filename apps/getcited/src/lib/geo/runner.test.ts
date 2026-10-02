import { describe, it, expect } from "vitest";
import { InProcessPanelRunner, customSkipWarning } from "./runner";
import { MemoryGeoStore } from "./memory-store";
import { buildReport } from "./report";

describe("InProcessPanelRunner (mock mode, no keys)", () => {
  it("runs a panel end-to-end with no API keys and costs $0", async () => {
    const store = new MemoryGeoStore();
    const runner = new InProcessPanelRunner(store, {
      costCapUsd: 1.0,
      keys: {}, forceMock: true, // explicit prepared mock mode
    });

    const out = await runner.run({
      brand: "Northstar",
      competitors: ["Cloudinary", "ImageKit"],
      prompt_set_id: "demo",
      panel: ["haiku"],
    });

    expect(out.status).toBe("completed");
    expect(out.cost_usd).toBe(0);
    expect(out.answer_count).toBe(4); // demo has 4 prompts × 1 run × 1 panelist
    const total = out.share_of_voice.reduce((a, b) => a + b.sov, 0);
    // SoV sums to 1 (something was mentioned by the mock) or 0.
    expect(total === 0 || Math.abs(total - 1) < 1e-6).toBe(true);

    const report = await buildReport(store, out.report_id);
    expect(report).not.toBeNull();
    expect(report!.answers.length).toBe(4);
  });

  it("rejects an unknown panelist with a clear error", async () => {
    const store = new MemoryGeoStore();
    const runner = new InProcessPanelRunner(store, { costCapUsd: 1.0, keys: {} });
    await expect(
      runner.run({
        brand: "X",
        competitors: ["Y"],
        prompts: ["a?"],
        // @ts-expect-error intentionally invalid panelist id
        panel: ["not-a-model"],
      }),
    ).rejects.toThrow(/Unknown panelist/);
  });

  it("enforces the workload ceiling", async () => {
    const store = new MemoryGeoStore();
    const runner = new InProcessPanelRunner(store, { costCapUsd: 1.0, keys: {} });
    const prompts = Array.from({ length: 50 }, (_, i) => `q${i}?`);
    await expect(
      runner.run({ brand: "X", competitors: ["Y"], prompts, panel: ["haiku"], runs: 5 }),
    ).rejects.toThrow(/Workload too large/);
  });

  it("missing live keys fail closed rather than mixing samples into a real report", async () => {
    const runner = new InProcessPanelRunner(new MemoryGeoStore(), {costCapUsd:1, keys:{custom:"not-valid-json"}});
    await expect(runner.run({brand:"Acme",competitors:["Rival"],prompt_set_id:"demo",panel:["haiku","custom"]})).rejects.toThrow(/not configured/);
  });

  it("customSkipWarning redacts the key even when the endpoint reflects it (reviewer repro)", () => {
    const SECRET = "sk-SUPER-SECRET-abc123XYZ";
    const blob = JSON.stringify({ baseURL: "https://evil.example/v1", model: "x", apiKey: SECRET });
    // The exact leak the security review reproduced: a hostile endpoint echoing the
    // Authorization header into its error body.
    const w = customSkipWarning(
      new Error(`boom (seen auth: Bearer ${SECRET})`),
      blob,
    );
    expect(w).toMatch(/custom model skipped/i);
    expect(w).not.toContain(SECRET);
    expect(w).toContain("***");
    // Bearer scrub still fires when the blob can't be parsed for the exact key.
    const w2 = customSkipWarning(new Error(`nope: Bearer ${SECRET}`), "not-json");
    expect(w2).not.toContain(SECRET);
  });
});
