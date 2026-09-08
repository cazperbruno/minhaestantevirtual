import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

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
      // Um único Service Worker reúne PWA + Web Push. Isso evita duas
      // registrations concorrendo pelo mesmo scope "/".
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "robots.txt", "icon-192.png", "icon-512.png", "apple-touch-icon.png"],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: "Readify — Sua biblioteca pessoal",
        short_name: "Readify",
        description: "Descubra, organize e celebre seus livros. O app definitivo para leitores apaixonados.",
        theme_color: "#e11d29",
        background_color: "#0b0b0d",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        lang: "pt-BR",
        categories: ["books", "education", "lifestyle"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
        ],
      },
    }),
    // Bundle analyzer — gera dist/stats.html no build, ajuda a detectar
    // regressões de tamanho. Não afeta dev nem o bundle final.
    mode === "production" && visualizer({
      filename: "dist/stats.html",
      template: "treemap",
      gzipSize: true,
      brotliSize: true,
      open: false,
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
