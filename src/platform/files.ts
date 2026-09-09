import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNativePlatform } from "@/platform/runtime";

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

/** Exporta texto/JSON de forma apropriada ao runtime. */
export async function exportTextFile(
  filename: string,
  data: string,
  mimeType = "application/json",
): Promise<"shared" | "downloaded"> {
  const safe = safeFilename(filename);

  if (isNativePlatform()) {
    const written = await Filesystem.writeFile({
      path: safe,
      data,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    await Share.share({
      title: "Exportação de dados do Readify",
      text: "Cópia dos seus dados do Readify",
      files: [written.uri],
      dialogTitle: "Salvar ou compartilhar exportação",
    });
    return "shared";
  }

  const blob = new Blob([data], { type: `${mimeType};charset=utf-8` });
  const href = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = safe;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(href);
  }
  return "downloaded";
}
