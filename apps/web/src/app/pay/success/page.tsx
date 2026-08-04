import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

export default function PaySuccessPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border rounded-xl shadow-sm p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
        <h1 className="text-xl font-semibold">¡Pago recibido!</h1>
        <p className="text-sm text-gray-600 mt-2">
          Gracias. Tu pago se ha procesado correctamente y la factura se
          actualizará en unos segundos.
        </p>
        <Link
          href="/"
          className="btn-primary inline-flex mt-5"
        >
          Volver
        </Link>
      </div>
    </main>
  );
}
