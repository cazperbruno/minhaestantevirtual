import { describe, it, expect } from "vitest";
import { dedupeByIsbn, bookDedupeKey } from "./dedupe";
import type { Book } from "@/types/book";

const mk = (over: Partial<Book>): Book => ({
  id: over.id ?? "id",
  title: over.title ?? "T",
  authors: over.authors ?? [],
  content_type: "book",
  ...over,
}) as Book;

describe("bookDedupeKey", () => {
  it("prioriza isbn_13", () => {
    expect(bookDedupeKey(mk({ isbn_13: "978", isbn_10: "10" }))).toBe("i13:978");
  });
  it("usa isbn_10 quando 13 ausente", () => {
    expect(bookDedupeKey(mk({ isbn_10: "10" }))).toBe("i10:10");
  });
  it("cai pra título+autor normalizados", () => {
    expect(bookDedupeKey(mk({ title: "Á  É!", authors: ["Autor  X"] }))).toBe("ta:a e|autor x");
  });
  it("retorna null sem título nem isbn", () => {
    expect(bookDedupeKey(mk({ title: "" }))).toBe(null);
  });
});

describe("dedupeByIsbn", () => {
  it("mantém só primeira ocorrência", () => {
    const a = mk({ id: "1", isbn_13: "X" });
    const b = mk({ id: "2", isbn_13: "X" });
    const c = mk({ id: "3", isbn_13: "Y" });
    const out = dedupeByIsbn([a, b, c], (x) => x);
    expect(out.map((x) => x.id)).toEqual(["1", "3"]);
  });
  it("itens sem chave passam direto", () => {
    const a = mk({ id: "1", title: "" });
    const b = mk({ id: "2", title: "" });
    const out = dedupeByIsbn([a, b], (x) => x);
    expect(out).toHaveLength(2);
  });
});
