/**
 * Smart cover URL resolution with multi-source fallback.
 * Order: provided URL → OpenLibrary by ISBN → Google Books cover → null.
 */

import type { Book } from "@/types/book";

const memo = new Map<string, string | null>();

async function urlExists(url: string): Promise<boolean> {
  try {
    // OpenLibrary returns a tiny 1x1 grey gif when ISBN doesn't exist.
    // We probe via HEAD when possible; on CORS failure assume valid.
    const res = await fetch(url, { method: "HEAD", mode: "no-cors" });
    // no-cors: opaque response — we can't read status. Trust it.
    return !!res;
  } catch {
    return false;
  }
}

export async function resolveCover(book: Pick<Book, "cover_url" | "isbn_10" | "isbn_13" | "title" | "authors">): Promise<string | null> {
  const key = book.cover_url || book.isbn_13 || book.isbn_10 || book.title;
  if (memo.has(key)) return memo.get(key)!;

  // 1. Already has a URL
  if (book.cover_url) {
    memo.set(key, book.cover_url);
    return book.cover_url;
  }

  // 2. Try OpenLibrary by ISBN
  const isbn = book.isbn_13 || book.isbn_10;
  if (isbn) {
    const ol = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
    if (await urlExists(ol)) {
      memo.set(key, ol);
      return ol;
    }
  }

  // 3. Try Google Books cover by ISBN (no API key needed for basic cover)
  if (isbn) {
    try {
      const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&fields=items(volumeInfo/imageLinks)&maxResults=1`);
      if (r.ok) {
        const j = await r.json();
        const link = j.items?.[0]?.volumeInfo?.imageLinks;
        const url = (link?.extraLarge || link?.large || link?.thumbnail || "").replace("http://", "https://").replace("&edge=curl", "");
        if (url) {
          memo.set(key, url);
          return url;
        }
      }
    } catch { /* ignore */ }
  }

  memo.set(key, null);
  return null;
}
