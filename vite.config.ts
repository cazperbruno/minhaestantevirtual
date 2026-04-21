import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    // Versão do build — usada no indicador de versão para suporte/debug.
    __APP_BUILD__: JSON.stringify(new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12)),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query"],
    force: true,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // prompt mode: NÃO ativa o novo SW sozinho — o app pede confirmação
      // ao usuário (UpdatePrompt). Evita estado misto de chunks antigo+novo
      // que causa "tela branca / Failed to fetch dynamically imported module"
      // em dispositivos que estavam com versão anterior em cache.
      registerType: "prompt",
      // Service worker NEVER ativa em dev — evita poluição do preview do Lovable
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "robots.txt", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Página — Sua biblioteca pessoal",
        short_name: "Página",
        description: "Descubra, organize e celebre seus livros. O app definitivo para leitores apaixonados.",
        theme_color: "#0f0d0a",
        background_color: "#0f0d0a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        lang: "pt-BR",
        categories: ["books", "education", "lifestyle"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ],
      },
      workbox: {
        // skipWaiting=false: o SW novo só assume após updateSW(true) chamar skipWaiting
        // via mensagem (feito automaticamente pelo virtual:pwa-register em prompt mode).
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // HTML é roteado pelo SPA: navegações vão para index.html via NetworkFirst
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/assets\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          // 1) HTML / navegação → NetworkFirst (sempre tenta rede primeiro, fallback cache)
          //    Garante que mudanças de deploy apareçam no próximo refresh.
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-pages",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          // 2) JS/CSS com hash → StaleWhileRevalidate (carrega rápido + atualiza em bg)
          {
            urlPattern: ({ request }) => request.destination === "script" || request.destination === "style",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-resources",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // 3) Fontes Google → CacheFirst (raramente mudam)
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // 4) Capas de livros (todas as fontes) → CacheFirst com expiração longa
          //    Cobre: openlibrary, googleusercontent (Google Books), itunes, archive.org,
          //    wikimedia, anilist (s4.anilist.co), e qualquer URL terminando em img.
          {
            urlPattern: ({ url, request }) =>
              request.destination === "image" && (
                /covers\.openlibrary\.org/.test(url.hostname) ||
                /books\.google\.com|googleusercontent\.com/.test(url.hostname) ||
                /mzstatic\.com|itunes\.apple\.com/.test(url.hostname) ||
                /archive\.org/.test(url.hostname) ||
                /wikimedia\.org|wikipedia\.org/.test(url.hostname) ||
                /anilist\.co/.test(url.hostname) ||
                /\.(png|jpg|jpeg|webp|svg|gif)(\?.*)?$/i.test(url.pathname)
              ),
            handler: "CacheFirst",
            options: {
              cacheName: "book-covers",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // 5) APIs Supabase → NetworkFirst com fallback rápido (nunca cacheia "forever")
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/(rest|functions)\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query"],
          "supabase-vendor": ["@supabase/supabase-js"],
          "pdf-vendor": ["jspdf", "jspdf-autotable"],
          "chart-vendor": ["recharts"],
          "scanner-vendor": ["@zxing/browser", "@zxing/library"],
          "radix-vendor": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-accordion",
            "@radix-ui/react-avatar",
            "@radix-ui/react-toast",
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
