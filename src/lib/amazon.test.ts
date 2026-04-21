import { describe, it, expect, vi } from "vitest";

// Mock track antes de importar amazon
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { amazonSearchUrl, openAmazon } from "./amazon";
import { track } from "@/lib/track";

describe("amazonSearchUrl", () => {
  it("usa isbn_13 quando disponível (prioridade máxima)", () => {
    const url = amazonSearchUrl({
      title: "1984",
      authors: ["George Orwell"],
      isbn_13: "9788535914849",
      isbn_10: "8535914846",
    });
    expect(url).toContain("k=9788535914849");
    expect(url).toContain("amazon.com.br/s?");
  });

  it("usa isbn_10 quando isbn_13 ausente", () => {
    const url = amazonSearchUrl({
      title: "T",
      authors: ["A"],
      isbn_10: "8535914846",
    });
    expect(url).toContain("k=8535914846");
  });

  it("cai pra título + primeiro autor sem ISBN", () => {
    const url = amazonSearchUrl({
      title: "Dom Casmurro",
      authors: ["Machado de Assis", "Outro"],
    });
    // URL encoded
    expect(decodeURIComponent(url)).toContain("k=Dom Casmurro Machado de Assis");
  });

  it("título sozinho quando não há autor", () => {
    const url = amazonSearchUrl({ title: "Só Título", authors: [] });
    expect(decodeURIComponent(url)).toContain("k=Só Título");
  });

  it("inclui tag de afiliados", () => {
    const url = amazonSearchUrl({ title: "X", authors: [], isbn_13: "123" });
    expect(url).toMatch(/[?&]tag=/);
  });
});

describe("openAmazon", () => {
  it("abre nova aba e registra track click", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    openAmazon({ id: "book-1", title: "1984", authors: [], isbn_13: "9788535914849" });
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("amazon.com.br"),
      "_blank",
      "noopener,noreferrer",
    );
    expect(track).toHaveBeenCalledWith("click", "book-1", { target: "amazon" });
    openSpy.mockRestore();
  });

  it("não quebra se track lançar erro", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    (track as any).mockImplementationOnce(() => { throw new Error("boom"); });
    expect(() =>
      openAmazon({ id: "x", title: "T", authors: [] }),
    ).not.toThrow();
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
