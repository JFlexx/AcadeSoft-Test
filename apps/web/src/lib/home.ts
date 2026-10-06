/** Where each role lands after logging in (and is sent back to from other areas). */
export function homeFor(role: string): string {
  if (role === 'guardian') return '/portal';
  if (role === 'teacher') return '/teacher';
  return '/';
}

/** Roles with their own area outside the admin app. */
export const isAdminAppRole = (role: string) => homeFor(role) === '/';
