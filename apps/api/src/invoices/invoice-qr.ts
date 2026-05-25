// Verifactu / Veri*Factu QR + verification URL for invoices.
//
// AEAT specifies a QR that, when scanned, points to a verification endpoint
// on agenciatributaria.gob.es. The same URL works in two regimes:
//   - "Veri*Factu" (we submit each invoice to AEAT in real time) → AEAT
//     itself validates against its own registry when the QR is scanned.
//   - "Sistema Informático de Facturación no-veri*factu" (we keep our own
//     records) → the scanner sees a "not registered" response. Still legal,
//     but the academy is responsible for retention.
//
// We emit the same QR in both modes. Wiring the AEAT submission belongs to a
// future sub-PR; meanwhile the QR is already future-proof.
//
// URL format (per AEAT technical spec):
//   https://{host}/wlpl/TIKE-CONT/ValidarQR?nif=...&numserie=...&fecha=DD-MM-YYYY&importe=N.NN

import QRCode from 'qrcode';

// Production host. Switch to preverifactu.aeat.es for the sandbox when we
// wire the AEAT submission and want to QR-validate against the test ledger.
const AEAT_HOST = 'www2.agenciatributaria.gob.es';

export type VerifactuQrInput = {
  emitterTaxId: string;
  invoiceNumber: string;
  issueDate: Date;
  amount: string; // "50.00" — already formatted with 2 decimals
};

export function buildVerifactuQrUrl(input: VerifactuQrInput): string {
  const d = input.issueDate;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const fecha = `${dd}-${mm}-${yyyy}`;

  const qs = new URLSearchParams({
    nif: input.emitterTaxId,
    numserie: input.invoiceNumber,
    fecha,
    importe: input.amount,
  });

  return `https://${AEAT_HOST}/wlpl/TIKE-CONT/ValidarQR?${qs.toString()}`;
}

export async function buildInvoiceQrPng(url: string): Promise<Buffer> {
  // Margin 1 + scale 4 ≈ 150px when version stays low. Embedded in PDF at
  // small size, plenty of resolution for phone scanning.
  return QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 4,
  });
}
