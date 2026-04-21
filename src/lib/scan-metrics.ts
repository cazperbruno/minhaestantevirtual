/**
 * Scan metrics — mede o tempo médio de leitura de ISBN.
 *
 * Medimos do instante em que a câmera começa a decodificar
 * (`markScanStart`) até o callback de sucesso (`markScanSuccess`).
 *
 * Métricas ficam em memória + localStorage (últimos 20 scans) e
 * são enviadas para o pipeline de tracking só agregadas — sem PII.
 */

const KEY = "readify:scan-metrics-v1";
const MAX = 20;

interface Sample {
  ms: number;          // tempo até decodificar
  ts: number;          // quando ocorreu
  format?: string;     // EAN_13, UPC_A, etc
}

function load(): Sample[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Sample[]) : [];
  } catch {
    return [];
  }
}

function save(samples: Sample[]) {
  try { localStorage.setItem(KEY, JSON.stringify(samples.slice(-MAX))); } catch { /* quota */ }
}

let startTs: number | null = null;

export function markScanStart() {
  startTs = performance.now();
}

export function markScanSuccess(format?: string) {
  if (startTs == null) return;
  const ms = Math.round(performance.now() - startTs);
  startTs = null;
  if (ms <= 0 || ms > 60_000) return; // ignora ruído
  const samples = load();
  samples.push({ ms, ts: Date.now(), format });
  save(samples);
}

export function markScanCancelled() {
  startTs = null;
}

export function getScanStats(): {
  count: number;
  median: number;
  p90: number;
  last?: number;
} {
  const samples = load();
  if (samples.length === 0) return { count: 0, median: 0, p90: 0 };
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  return {
    count: samples.length,
    median,
    p90,
    last: samples[samples.length - 1].ms,
  };
}
