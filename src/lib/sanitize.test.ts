import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizeRichText, safeExternalUrl } from "./sanitize";

describe("sanitizeText", () => {
  it("strips all HTML tags", () => {
    expect(sanitizeText("<script>alert(1)</script>hello")).toBe("hello");
    expect(sanitizeText("<b>bold</b> text")).toBe("bold text");
  });
  it("handles null/empty", () => {
    expect(sanitizeText(null)).toBe("");
    expect(sanitizeText(undefined)).toBe("");
    expect(sanitizeText("")).toBe("");
  });
  it("preserves plain text", () => {
    expect(sanitizeText("normal text 123")).toBe("normal text 123");
  });
});

describe("sanitizeRichText", () => {
  it("preserves allowed tags", () => {
    const html = sanitizeRichText("<b>bold</b> <em>italic</em>");
    expect(html).toContain("<b>bold</b>");
    expect(html).toContain("<em>italic</em>");
  });
  it("removes scripts", () => {
    const html = sanitizeRichText("<script>x()</script><b>ok</b>");
    expect(html).not.toContain("script");
    expect(html).toContain("<b>ok</b>");
  });
  it("removes javascript: URLs", () => {
    const html = sanitizeRichText('<a href="javascript:alert(1)">click</a>');
    expect(html).not.toContain("javascript:");
  });
});

describe("safeExternalUrl", () => {
  it("accepts https URLs", () => {
    expect(safeExternalUrl("https://example.com")).toBe("https://example.com/");
  });
  it("rejects javascript: URLs", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
  });
  it("rejects malformed URLs", () => {
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});
