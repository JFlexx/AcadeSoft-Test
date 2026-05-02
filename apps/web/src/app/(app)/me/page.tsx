'use client';

import { useAuth } from '@/lib/auth-context';

export default function MePage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="p-6 max-w-md">
      <h1 className="text-xl font-semibold mb-4">Mi cuenta</h1>
      <dl className="text-sm grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
        <dt className="text-gray-500">Nombre</dt>
        <dd>
          {user.firstName} {user.lastName}
        </dd>
        <dt className="text-gray-500">Email</dt>
        <dd>{user.email}</dd>
        <dt className="text-gray-500">Rol</dt>
        <dd>{user.role}</dd>
        <dt className="text-gray-500">Academia</dt>
        <dd>
          {user.tenant.name}{' '}
          <span className="text-gray-400">({user.tenant.slug})</span>
        </dd>
        <dt className="text-gray-500">Estado</dt>
        <dd>{user.status}</dd>
      </dl>
    </div>
  );
}
