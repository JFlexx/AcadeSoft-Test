import Link from 'next/link';
import { XCircle } from 'lucide-react';

export default function PayCancelledPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border rounded-xl shadow-sm p-8 text-center">
        <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
        <h1 className="text-xl font-semibold">Pago cancelado</h1>
        <p className="text-sm text-gray-600 mt-2">
          No se ha realizado ningún cargo. Puedes intentarlo de nuevo cuando
          quieras.
        </p>
        <Link href="/" className="btn-primary inline-flex mt-5">
          Volver
        </Link>
      </div>
    </main>
  );
}
