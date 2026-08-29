import { useEffect, useRef } from "react";
import QRCode from "qrcode";

/**
 * Renders a value as a scannable QR code. Always dark-on-white regardless of
 * theme — a QR on a tinted ground scans unreliably, and these get printed.
 */
export const QrCode = ({ value, size = 148 }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: "#14120f", light: "#ffffff" },
    }).catch(() => {
      // A failed render leaves the text link, which still works.
    });
  }, [value, size]);

  if (!value) return null;

  return (
    <canvas
      ref={ref}
      className="rounded-[10px] border border-hairline bg-white"
      role="img"
      aria-label={`QR code for ${value}`}
    />
  );
};
