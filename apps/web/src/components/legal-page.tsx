import Link from 'next/link';
import { ReactNode } from 'react';
import { LEGAL_VERSION } from '@/lib/legal';

/** Shell of the legal pages: readable column, draft notice, cross-links. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <article className="max-w-3xl mx-auto bg-white border rounded-xl p-6 sm:p-10 text-sm leading-relaxed text-gray-800 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h2]:mt-7 [&_h2]:mb-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_li]:mb-1">
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Borrador (versión {LEGAL_VERSION}) pendiente de revisión legal. Los datos entre corchetes
          se completarán antes de la puesta en producción.
        </p>
        <h1 className="text-xl font-semibold text-gray-900 mb-4">{title}</h1>
        {children}
        <nav className="mt-10 pt-4 border-t flex flex-wrap gap-4 text-xs text-gray-500">
          <Link href="/legal/terminos" className="hover:underline">
            Términos del servicio
          </Link>
          <Link href="/legal/privacidad" className="hover:underline">
            Privacidad
          </Link>
          <Link href="/legal/encargado" className="hover:underline">
            Contrato de encargado del tratamiento
          </Link>
        </nav>
      </article>
    </main>
  );
}
