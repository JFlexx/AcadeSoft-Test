import { escapeHtml } from '../email/html';

export type TrialData = {
  academy: string;
  studentName: string;
  groupName: string;
  courseName: string;
  /** Already formatted in the academy's time zone. */
  when: string;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

export function trialSubject(d: TrialData): string {
  return `Clase de prueba confirmada: ${d.groupName}`;
}

export function trialHtml(d: TrialData): string {
  const contact = [d.contactEmail, d.contactPhone]
    .filter((x): x is string => !!x)
    .map(escapeHtml)
    .join(' · ');

  return `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
  <p>Hola,</p>
  <p>Hemos reservado una <strong>clase de prueba</strong> para
  <strong>${escapeHtml(d.studentName)}</strong>:</p>
  <ul>
    <li><strong>${escapeHtml(d.groupName)}</strong> (${escapeHtml(d.courseName)})</li>
    <li>${escapeHtml(d.when)}</li>
    ${d.address ? `<li>${escapeHtml(d.address)}</li>` : ''}
  </ul>
  <p>Si no podéis venir, responde a este email y buscamos otro día.</p>
  <p>¡Os esperamos!<br>${escapeHtml(d.academy)}${contact ? `<br><small>${contact}</small>` : ''}</p>
</body></html>`;
}
