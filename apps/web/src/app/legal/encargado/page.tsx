import { LegalPage } from '@/components/legal-page';
import { PROVIDER } from '@/lib/legal';

export const metadata = { title: `Contrato de encargado del tratamiento · ${PROVIDER.product}` };

export default function DpaPage() {
  const p = PROVIDER;
  return (
    <LegalPage title="Contrato de encargado del tratamiento">
      <p>
        Conforme al artículo 28 del Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018
        (LOPDGDD), la academia que contrata {p.product} («el responsable») encarga a {p.legalName},
        NIF {p.taxId} («el encargado»), el tratamiento de datos necesario para prestar el servicio.
        La academia lo acepta al darse de alta.
      </p>

      <h2>1. Objeto y duración</h2>
      <p>
        Alojar y tratar, mediante el software, los datos que la academia introduce, solo para
        prestarle el servicio y mientras dure el contrato.
      </p>

      <h2>2. Datos y personas afectadas</h2>
      <ul>
        <li>
          <strong>Alumnos</strong> (incluidos menores de edad): identificación, contacto, fecha de
          nacimiento, inscripciones, asistencia, notas y comentarios del profesorado, datos
          bancarios para domiciliación, facturas y pagos.
        </li>
        <li>
          <strong>Familias y tutores</strong>: identificación, contacto y, si se les da acceso, sus
          credenciales del portal.
        </li>
        <li>
          <strong>Personal de la academia</strong>: identificación, contacto y credenciales.
        </li>
      </ul>
      <p>
        La academia no debe introducir categorías especiales de datos (por ejemplo, de salud) salvo
        que sea imprescindible y cuente con base jurídica para ello.
      </p>

      <h2>3. Obligaciones del encargado</h2>
      <ul>
        <li>Tratar los datos solo siguiendo las instrucciones documentadas de la academia.</li>
        <li>Garantizar la confidencialidad de las personas autorizadas a tratarlos.</li>
        <li>
          Aplicar medidas de seguridad adecuadas (art. 32): cifrado en tránsito, contraseñas
          cifradas, aislamiento de los datos de cada academia, control de acceso por roles, copias
          de seguridad y registro de las acciones sobre derechos.
        </li>
        <li>
          Ayudar a la academia a atender los derechos de los interesados: el software permite
          exportar todos los datos de un alumno y suprimirlos.
        </li>
        <li>
          Notificar a la academia, sin dilación indebida y a más tardar en 48 horas, cualquier
          brecha de seguridad que afecte a sus datos.
        </li>
        <li>Poner a su disposición la información necesaria para demostrar el cumplimiento.</li>
      </ul>

      <h2>4. Subencargados</h2>
      <p>
        La academia autoriza a recurrir a: alojamiento ({p.hosting}), envío de emails y, si se
        activa, procesamiento de pagos con tarjeta. El encargado informará de cualquier cambio con
        antelación para que la academia pueda oponerse, y exigirá a los subencargados las mismas
        obligaciones. Los datos se alojan en la Unión Europea.
      </p>

      <h2>5. Fin del contrato</h2>
      <p>
        Al terminar, la academia podrá exportar sus datos; después, el encargado los suprimirá,
        salvo los que una ley obligue a conservar, que quedarán bloqueados durante ese plazo.
      </p>

      <h2>6. Obligaciones de la academia</h2>
      <p>
        Informar a alumnos y familias del tratamiento (el software ofrece una política de
        privacidad con sus datos en el formulario de inscripción), contar con base jurídica para
        cada tratamiento y velar por la exactitud de los datos.
      </p>
    </LegalPage>
  );
}
