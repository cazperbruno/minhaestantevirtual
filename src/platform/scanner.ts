import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  Html5QrcodeSupportedFormats,
} from "@capacitor/barcode-scanner";
import { isNativePlatform } from "@/platform/runtime";

export interface NativeBarcodeResult {
  code: string;
  format: number;
}

/**
 * O scanner nativo fica opt-in até passar pela bateria real Android+iOS.
 * O fallback ZXing continua sendo o caminho padrão durante a reativação.
 */
export function nativeBarcodeScannerEnabled(): boolean {
  return (
    isNativePlatform() &&
    import.meta.env.VITE_ENABLE_NATIVE_BARCODE_SCANNER === "true"
  );
}

export async function scanNativeIsbn(): Promise<NativeBarcodeResult | null> {
  if (!nativeBarcodeScannerEnabled()) return null;

  const result = await CapacitorBarcodeScanner.scanBarcode({
    // ISBN de livros modernos é normalmente EAN-13. No iOS, UPC-A também é
    // reportado dentro de EAN-13/Apple Vision, portanto este hint é adequado.
    hint: Html5QrcodeSupportedFormats.EAN_13,
    cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
    scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
    scanInstructions: "Posicione o código ISBN dentro da área de leitura",
    cancelButtonAccessibilityLabel: "Cancelar leitura do ISBN",
    torchButtonOnAccessibilityLabel: "Desligar lanterna",
    torchButtonOffAccessibilityLabel: "Ligar lanterna",
  });

  const code = String(result.ScanResult || "").replace(/[^0-9Xx]/g, "");
  if (code.length !== 10 && code.length !== 13) return null;

  return { code, format: Number(result.format) };
}
