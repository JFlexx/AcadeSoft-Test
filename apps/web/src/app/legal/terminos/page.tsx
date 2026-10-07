import { LegalPage } from '@/components/legal-page';
import { PROVIDER } from '@/lib/legal';

export const metadata = { title: `Términos del servicio · ${PROVIDER.product}` };

export default function TermsPage() {
  const p = PROVIDER;
  return (
    <LegalPage title="Términos del servicio">
      <p>
        Estos términos regulan el uso de {p.product}, el software de gestión para academias que
        presta {p.legalName} (NIF {p.taxId}, {p.address}) («el proveedor») a la academia que se da
        de alta («el cliente»).
      </p>

      <h2>1. El servicio</h2>
      <p>
        {p.product} es un software como servicio para gestionar alumnos, familias, profesores,
        grupos, calendario, asistencia, notas, facturación, cobros y comunicaciones. El cliente
        accede a través de internet; el proveedor se encarga del alojamiento, el mantenimiento, las
        copias de seguridad y las actualizaciones.
      </p>

      <h2>2. Alta y cuenta</h2>
      <p>
        Quien da de alta la academia declara tener capacidad para contratar en su nombre. El
        cliente es responsable de custodiar las contraseñas de sus usuarios (administración,
        secretaría, profesores y familias) y de los accesos que concede.
      </p>

      <h2>3. Datos del cliente y protección de datos</h2>
      <p>
        Los datos que el cliente introduce (de alumnos, familias, profesores…) son suyos: el cliente
        es el responsable del tratamiento y el proveedor actúa como encargado, en los términos del{' '}
        <a href="/legal/encargado" className="underline">
          contrato de encargado del tratamiento
        </a>
        , que forma parte de estos términos. El cliente puede exportar sus datos en cualquier
        momento.
      </p>

      <h2>4. Facturación electrónica y cumplimiento</h2>
      <p>
        El software genera las facturas con numeración correlativa, huella encadenada y código QR
        conforme al Reglamento de sistemas informáticos de facturación (Veri*Factu). El cliente es
        responsable del contenido de sus facturas y de sus obligaciones fiscales.
      </p>

      <h2>5. Uso aceptable</h2>
      <p>
        El cliente no usará el servicio para fines ilícitos, ni intentará acceder a datos de otras
        academias, ni enviará comunicaciones comerciales no solicitadas a través de él.
      </p>

      <h2>6. Precio, duración y baja</h2>
      <p>
        Las condiciones económicas se acuerdan aparte. El cliente puede darse de baja en cualquier
        momento; antes podrá exportar sus datos, y tras la baja se devolverán o suprimirán según el
        contrato de encargado, salvo lo que la ley obligue a conservar.
      </p>

      <h2>7. Disponibilidad y responsabilidad</h2>
      <p>
        El proveedor pondrá los medios razonables para que el servicio esté disponible y seguro,
        pero no garantiza una disponibilidad ininterrumpida. Su responsabilidad se limita a los
        daños directos causados por dolo o negligencia grave, hasta el importe pagado por el
        cliente en los doce meses anteriores.
      </p>

      <h2>8. Cambios</h2>
      <p>
        El proveedor podrá modificar estos términos avisando al cliente con antelación razonable.
        Si el cliente no está de acuerdo, podrá darse de baja.
      </p>

      <h2>9. Ley aplicable</h2>
      <p>
        Se rigen por la legislación española. Para cualquier controversia, las partes se someten a
        los juzgados y tribunales del domicilio del proveedor, salvo que la ley disponga otra cosa.
      </p>
    </LegalPage>
  );
}
