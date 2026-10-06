import { escapeHtml } from '../email/html';

export type AbsenceData = {
  academy: string;
  studentName: string;
  groupName: string;
  /** Already formatted in the academy's time zone. */
  when: string;
  contactEmail: string | null;
  contactPhone: string | null;
};

export function absenceSubject(d: AbsenceData): string {
  return `Falta de asistencia: ${d.studentName} (${d.groupName})`;
}

export function absenceHtml(d: AbsenceData): string {
  const contact = [d.contactEmail, d.contactPhone]
    .filter((x): x is string => !!x)
    .map(escapeHtml)
    .join(' · ');

  return `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
  <p>Hola,</p>
  <p>Te informamos de que <strong>${escapeHtml(d.studentName)}</strong> no ha asistido
  a la clase de <strong>${escapeHtml(d.groupName)}</strong> del ${escapeHtml(d.when)}.</p>
  <p>Si ya lo habíais avisado o se trata de un error, responde a este email y lo
  corregimos.</p>
  <p>Un saludo,<br>${escapeHtml(d.academy)}${contact ? `<br><small>${contact}</small>` : ''}</p>
</body></html>`;
}
