import { LegalPage } from '@/components/legal-page';
import { PROVIDER } from '@/lib/legal';

export const metadata = { title: `Privacidad · ${PROVIDER.product}` };

export default function PlatformPrivacyPage() {
  const p = PROVIDER;
  return (
    <LegalPage title="Política de privacidad de la plataforma">
      <p>
        Esta política explica cómo trata {p.legalName} los datos de las personas que usan{' '}
        {p.product} en nombre de una academia (administración, secretaría y profesores) y los de
        quien la contrata. <strong>Los datos de alumnos y familias</strong> los trata cada academia,
        que es su responsable; su política está enlazada en su formulario de inscripción.
      </p>

      <h2>Responsable</h2>
      <p>
        {p.legalName}, NIF {p.taxId}, {p.address}. Contacto de privacidad: {p.privacyEmail}.
      </p>

      <h2>Qué datos y para qué</h2>
      <ul>
        <li>
          <strong>Cuenta</strong>: nombre, email y contraseña (guardada cifrada) de los usuarios,
          para darles acceso y mantener la seguridad del servicio.
        </li>
        <li>
          <strong>Contratación</strong>: datos de la academia y de su representante, para prestar el
          servicio y facturarlo.
        </li>
        <li>
          <strong>Seguridad</strong>: registros técnicos (fecha del último acceso, intentos de
          inicio de sesión) para prevenir accesos indebidos.
        </li>
      </ul>

      <h2>Base jurídica</h2>
      <p>
        La ejecución del contrato con la academia, el cumplimiento de obligaciones legales
        (fiscales) y el interés legítimo en la seguridad del servicio.
      </p>

      <h2>Conservación</h2>
      <p>
        Mientras dure la relación con la academia y, después, durante los plazos legales de
        prescripción de responsabilidades.
      </p>

      <h2>Destinatarios</h2>
      <p>
        Proveedores que nos ayudan a prestar el servicio, con contrato de encargado y dentro de la
        Unión Europea siempre que sea posible: alojamiento ({p.hosting}), envío de emails y, si la
        academia lo activa, el procesador de pagos con tarjeta. No vendemos ni cedemos datos.
      </p>

      <h2>Cookies</h2>
      <p>
        Solo usamos una cookie técnica imprescindible para mantener la sesión iniciada. No hay
        cookies de analítica ni de publicidad, por lo que no se pide consentimiento para ellas.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad
        escribiendo a {p.privacyEmail}. Si no quedas satisfecho, puedes reclamar ante la Agencia
        Española de Protección de Datos (aepd.es).
      </p>
    </LegalPage>
  );
}
