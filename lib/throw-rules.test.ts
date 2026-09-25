import { describe, expect, it } from "vitest";
import { pickThrowName, THROW_ODDS } from "@/lib/throw-rules";

describe("yut throw profiles", () => {
  it("keeps the traditional inside distribution", () => {
    expect(pickThrowName("inside", 0.01)).toBe("backdo");
    expect(pickThrowName("inside", 0.1)).toBe("do");
    expect(pickThrowName("inside", 0.9)).toBe("yut");
    expect(pickThrowName("inside", 0.99)).toBe("mo");
    expect(THROW_ODDS.inside.nak).toBe(0);
  });

  it("adds risk and slightly raises bonus outcomes outside", () => {
    expect(pickThrowName("outside", 0.01)).toBe("nak");
    expect(pickThrowName("outside", 0.86)).toBe("yut");
    expect(pickThrowName("outside", 0.96)).toBe("mo");
    expect(THROW_ODDS.outside.yut).toBeGreaterThan(THROW_ODDS.inside.yut);
    expect(THROW_ODDS.outside.mo).toBeGreaterThan(THROW_ODDS.inside.mo);
  });
});
