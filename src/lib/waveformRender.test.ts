import { describe, expect, it } from "vitest";
import { formatTick, niceTimeTicks } from "./waveformRender";

describe("niceTimeTicks", () => {
  it("picks fine steps for short sounds", () => {
    expect(niceTimeTicks(0.3, 500).major).toBe(0.05);
    expect(niceTimeTicks(0.05, 500).major).toBe(0.01);
  });

  it("picks coarser steps as duration grows", () => {
    expect(niceTimeTicks(2, 900).major).toBe(0.5);
    expect(niceTimeTicks(12, 900).major).toBe(1);
    expect(niceTimeTicks(90, 900).major).toBe(10);
  });

  it("caps at the largest step and survives degenerate input", () => {
    expect(niceTimeTicks(10_000, 400).major).toBe(60);
    expect(niceTimeTicks(0, 400).major).toBe(1);
    expect(niceTimeTicks(1, 0).major).toBe(1);
  });

  it("derives minor ticks as a fifth of major", () => {
    const { major, minor } = niceTimeTicks(12, 900);
    expect(minor).toBeCloseTo(major / 5);
  });
});

describe("formatTick", () => {
  it("uses decimal seconds below a minute", () => {
    expect(formatTick(0.05, 0.05)).toBe("0.05");
    expect(formatTick(1.5, 0.5)).toBe("1.5");
    expect(formatTick(5, 1)).toBe("5");
    expect(formatTick(0, 0.1)).toBe("0.0");
  });

  it("uses m:ss for minute-scale ticks", () => {
    expect(formatTick(60, 10)).toBe("1:00");
    expect(formatTick(90, 30)).toBe("1:30");
    expect(formatTick(125, 5)).toBe("2:05");
  });
});
