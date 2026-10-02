import { describe, it, expect } from "vitest";
import { computeShareOfVoice } from "./scoring";

describe("computeShareOfVoice", () => {
  it("counts each brand at most once per answer and normalizes SoV to sum 1", () => {
    const res = computeShareOfVoice({
      brand: "Northstar",
      competitors: ["Cloudinary", "ImageKit"],
      answers: [
        { prompt: "p1", mentions: ["Northstar", "Northstar", "Cloudinary"] },
        { prompt: "p1", mentions: ["Cloudinary"] },
        { prompt: "p2", mentions: ["ImageKit"] },
      ],
    });
    const total = res.shareOfVoice.reduce((a, b) => a + b.sov, 0);
    expect(total).toBeCloseTo(1, 6);
    const px = res.shareOfVoice.find((e) => e.brand === "Northstar")!;
    expect(px.mentions).toBe(1); // deduped within the single answer
    const cl = res.shareOfVoice.find((e) => e.brand === "Cloudinary")!;
    expect(cl.mentions).toBe(2);
  });

  it("returns all-zero SoV when nothing is mentioned (no divide-by-zero)", () => {
    const res = computeShareOfVoice({
      brand: "Brand",
      competitors: ["A", "B"],
      answers: [{ prompt: "p", mentions: [] }],
    });
    expect(res.shareOfVoice.every((e) => e.sov === 0)).toBe(true);
  });

  it("identifies the top competitor per prompt", () => {
    const res = computeShareOfVoice({
      brand: "Me",
      competitors: ["Rival", "Other"],
      answers: [
        { prompt: "q", mentions: ["Rival"] },
        { prompt: "q", mentions: ["Rival", "Other"] },
        { prompt: "q", mentions: ["Me"] },
      ],
    });
    const q = res.perPrompt.find((p) => p.prompt === "q")!;
    expect(q.top_competitor).toBe("Rival");
    expect(q.mentioned_brands.sort()).toEqual(["Me", "Other", "Rival"]);
  });

  it("is case-insensitive when matching brand spellings", () => {
    const res = computeShareOfVoice({
      brand: "Northstar",
      competitors: ["Cloudinary"],
      answers: [{ prompt: "p", mentions: ["northstar", "CLOUDINARY"] }],
    });
    expect(res.shareOfVoice.find((e) => e.brand === "Northstar")!.mentions).toBe(1);
    expect(res.shareOfVoice.find((e) => e.brand === "Cloudinary")!.mentions).toBe(1);
  });
});
