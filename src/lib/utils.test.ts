import { describe, it, expect } from "vitest";
import { cn, normalizeUsername, displayUsername } from "./utils";

describe("cn", () => {
  it("combina classes simples", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("ignora valores falsy", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
  it("aplica twMerge (última classe conflitante vence)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});

describe("normalizeUsername", () => {
  it("retorna string vazia para null/undefined/empty", () => {
    expect(normalizeUsername(null)).toBe("");
    expect(normalizeUsername(undefined)).toBe("");
    expect(normalizeUsername("")).toBe("");
  });
  it("remove @ inicial e faz trim + lowercase", () => {
    expect(normalizeUsername("  @JOAO ")).toBe("joao");
  });
  it("remove múltiplos @ iniciais", () => {
    expect(normalizeUsername("@@maria")).toBe("maria");
  });
  it("preserva @ no meio", () => {
    expect(normalizeUsername("@ana@silva")).toBe("ana@silva");
  });
});

describe("displayUsername", () => {
  it("vazio quando entrada vazia", () => {
    expect(displayUsername("")).toBe("");
    expect(displayUsername(null)).toBe("");
  });
  it("adiciona um único @ no começo", () => {
    expect(displayUsername("joao")).toBe("@joao");
    expect(displayUsername("@joao")).toBe("@joao");
    expect(displayUsername("@@joao")).toBe("@joao");
  });
});
