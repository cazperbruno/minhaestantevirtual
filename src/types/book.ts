export type BookStatus = "not_read" | "reading" | "read" | "wishlist";

export interface Book {
  id: string;
  isbn_13?: string | null;
  isbn_10?: string | null;
  title: string;
  subtitle?: string | null;
  authors: string[];
  publisher?: string | null;
  published_year?: number | null;
  description?: string | null;
  cover_url?: string | null;
  page_count?: number | null;
  language?: string | null;
  categories?: string[] | null;
  source?: string | null;
  source_id?: string | null;
}

export interface UserBook {
  id: string;
  user_id: string;
  book_id: string;
  status: BookStatus;
  rating?: number | null;
  notes?: string | null;
  current_page?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  book?: Book;
}

export const STATUS_LABEL: Record<BookStatus, string> = {
  not_read: "Não lido",
  reading: "Lendo",
  read: "Lido",
  wishlist: "Desejo",
};

export const STATUS_COLOR: Record<BookStatus, string> = {
  not_read: "bg-status-not-read/20 text-status-not-read border-status-not-read/30",
  reading: "bg-status-reading/15 text-status-reading border-status-reading/30",
  read: "bg-status-read/15 text-status-read border-status-read/30",
  wishlist: "bg-status-wishlist/15 text-status-wishlist border-status-wishlist/30",
};
