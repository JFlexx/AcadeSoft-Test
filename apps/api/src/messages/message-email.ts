import { escapeHtml } from '../email/html';

export type MessageEmailData = {
  academy: string;
  body: string;
  contactEmail: string | null;
  contactPhone: string | null;
};

/** Plain-text message from the academy → safe HTML (escaped, line breaks kept). */
export function messageHtml(d: MessageEmailData): string {
  const body = escapeHtml(d.body.trim()).replace(/\r?\n/g, '<br>');
  const contact = [d.contactEmail, d.contactPhone]
    .filter((x): x is string => !!x)
    .map(escapeHtml)
    .join(' · ');
  return `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
  <p>${body}</p>
  <p>${escapeHtml(d.academy)}${contact ? `<br><small>${contact}</small>` : ''}</p>
</body></html>`;
}
