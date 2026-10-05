import { escapeHtml } from '../email/html';

export function passwordResetHtml(d: {
  firstName: string;
  academy: string;
  link: string;
  minutes: number;
}): string {
  const link = escapeHtml(d.link);
  return `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
  <p>Hola ${escapeHtml(d.firstName)},</p>
  <p>Hemos recibido una solicitud para restablecer tu contraseña de
  <strong>${escapeHtml(d.academy)}</strong>.</p>
  <p><a href="${link}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Elegir una nueva contraseña</a></p>
  <p style="font-size:13px;color:#555">O copia este enlace en el navegador:<br>${link}</p>
  <p style="font-size:13px;color:#555">El enlace caduca en ${d.minutes} minutos y solo
  sirve una vez. Si no lo has pedido tú, ignora este email: tu contraseña no cambia.</p>
</body></html>`;
}
