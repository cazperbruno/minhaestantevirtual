/**
 * Indicador discreto da versão do build, útil para suporte e debug de cache.
 * O valor vem de `__APP_BUILD__` injetado pelo Vite (vite.config.ts).
 */
export function VersionTag({ className = "" }: { className?: string }) {
  // Fallback se a constante não estiver definida (ex.: testes)
  const build = typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : "dev";
  return (
    <span
      className={`text-[10px] text-muted-foreground/60 tracking-wide tabular-nums ${className}`}
      aria-label={`Versão do app ${build}`}
      title="Versão do build"
    >
      build {build}
    </span>
  );
}
