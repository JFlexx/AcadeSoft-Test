'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LEGAL_VERSION, PROVIDER } from '@/lib/legal';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Controller = { name: string; taxId: string | null; address: string | null; contactEmail: string | null };

/**
 * Privacy policy of an academy for families: the academy is the controller
 * of the student's and family's data; the platform is its processor.
 * Generated from the academy's own details (Ajustes).
 */
export default function AcademyPrivacyPage() {
  const { slug } = useParams<{ slug: string }>();
  const [c, setC] = useState<Controller | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/academy/${slug}/groups`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setC(d.controller))
      .catch(() => setNotFound(true));
  }, [slug]);

  if (notFound) {
    return <p className="p-6 text-sm text-gray-600">No hemos encontrado esta academia.</p>;
  }
  if (!c) return <p className="p-6 text-sm text-gray-500">Cargando…</p>;

  const contact = c.contactEmail ?? 'el email de contacto de la academia';
  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <article className="max-w-3xl mx-auto bg-white border rounded-xl p-6 sm:p-10 text-sm leading-relaxed text-gray-800 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h2]:mt-7 [&_h2]:mb-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_li]:mb-1">
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Modelo de política (versión {LEGAL_VERSION}) pendiente de revisión legal por la academia.
        </p>
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Política de privacidad — {c.name}</h1>

        <h2>Responsable del tratamiento</h2>
        <p>
          {c.name}
          {c.taxId ? `, NIF ${c.taxId}` : ''}
          {c.address ? `, ${c.address}` : ''}. Contacto: {contact}.
        </p>

        <h2>Qué datos tratamos</h2>
        <p>
          Los del alumno y de su familia o tutores que nos facilitáis (identificación, contacto,
          fecha de nacimiento), y los que se generan durante su formación: inscripciones, asistencia,
          notas y comentarios del profesorado, facturas y pagos y, si domiciliáis los recibos, los
          datos bancarios.
        </p>

        <h2>Para qué y con qué base</h2>
        <ul>
          <li>
            Gestionar la inscripción, la clase de prueba si la pedís, y la formación del alumno:
            ejecución del contrato (o medidas precontractuales a vuestra petición).
          </li>
          <li>
            Facturar y cobrar, y conservar las facturas el tiempo que exige la ley: obligación legal.
          </li>
          <li>
            Avisaros de faltas, recibos pendientes, boletines de notas y comunicaciones de la
            academia: ejecución del contrato e interés legítimo en mantener informada a la familia.
          </li>
        </ul>

        <h2>Menores de edad</h2>
        <p>
          Si el alumno es menor de 14 años, los datos los facilitan y gestionan sus padres o
          tutores.
        </p>

        <h2>Cuánto tiempo</h2>
        <p>
          Mientras el alumno esté en la academia y, después, durante los plazos legales: las
          facturas, los años que exige la normativa fiscal y mercantil.
        </p>

        <h2>Quién más accede</h2>
        <p>
          Nuestro proveedor de software, {PROVIDER.product}, como encargado del tratamiento, con los
          datos alojados en la Unión Europea; y, si pagáis con tarjeta, el procesador de pagos. No
          cedemos vuestros datos a terceros salvo obligación legal.
        </p>

        <h2>Vuestros derechos</h2>
        <p>
          Podéis pedirnos acceso, rectificación, supresión, oposición, limitación y portabilidad de
          vuestros datos escribiendo a {contact}. Si no quedáis satisfechos, podéis reclamar ante la
          Agencia Española de Protección de Datos (aepd.es).
        </p>

        <p className="mt-8">
          <Link href={`/enroll/${slug}`} className="text-brand-700 hover:underline">
            ← Volver a la inscripción
          </Link>
        </p>
      </article>
    </main>
  );
}
