import { escapeHtml } from '../email/html';

export type SpotOfferData = {
  academy: string;
  studentName: string;
  groupName: string;
  courseName: string;
  contactEmail: string | null;
  contactPhone: string | null;
};

export function spotOfferSubject(d: SpotOfferData): string {
  return `Hay plaza en ${d.groupName} — ${d.academy}`;
}

export function spotOfferHtml(d: SpotOfferData): string {
  const contact = [d.contactEmail, d.contactPhone]
    .filter((x): x is string => !!x)
    .map(escapeHtml)
    .join(' · ');

  return `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
  <p>Hola,</p>
  <p>¡Buenas noticias! Ha quedado una plaza libre en <strong>${escapeHtml(d.groupName)}</strong>
  (${escapeHtml(d.courseName)}) y <strong>${escapeHtml(d.studentName)}</strong> es quien
  sigue en la lista de espera.</p>
  <p>Para reservarla, responde a este email${contact ? ' o contacta con nosotros' : ''}
  lo antes posible.</p>
  <p>Un saludo,<br>${escapeHtml(d.academy)}${contact ? `<br><small>${contact}</small>` : ''}</p>
</body></html>`;
}
