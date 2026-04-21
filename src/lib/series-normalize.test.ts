import { describe, it, expect } from "vitest";
import { normalizeSeriesTitle, isLikelySameSeries } from "./series-normalize";

describe("normalizeSeriesTitle", () => {
  it.each([
    ["Boa Noite Punpun Vol. 3", "boa noite punpun", 3],
    ["Sandman: Volume 1", "sandman", 1],
    ["Berserk #12", "berserk", 12],
    ["Berserk Tomo 04", "berserk", 4],
    ["Dom Casmurro", "dom casmurro", null],
    ["1984", "1984", null],
    ["Harry Potter e a Pedra Filosofal (2000)", "harry potter e a pedra filosofal", null],
  ])("%s → base=%s vol=%s", (input, base, volume) => {
    const r = normalizeSeriesTitle(input);
    expect(r.base).toBe(base);
    expect(r.volume).toBe(volume);
    expect(r.key).toBe(base.replace(/[^a-z0-9]+/g, ""));
  });

  it("entrada vazia retorna estrutura zero", () => {
    expect(normalizeSeriesTitle("")).toEqual({ base: "", volume: null, key: "" });
  });
});

describe("isLikelySameSeries", () => {
  it("igual → true", () => {
    expect(isLikelySameSeries("berserk", "berserk")).toBe(true);
  });
  it("containment forte → true", () => {
    expect(isLikelySameSeries("berserk", "berserkdeluxe")).toBe(true);
  });
  it("strings curtas distintas → false", () => {
    expect(isLikelySameSeries("a", "b")).toBe(false);
  });
  it("totalmente diferente → false", () => {
    expect(isLikelySameSeries("sandman", "berserk")).toBe(false);
  });
});
