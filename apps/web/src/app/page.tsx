import { redirect } from 'next/navigation';

// The dashboard lives at (app)/page.tsx which carries the auth layout.
// This root page is only reached if Next.js somehow doesn't resolve (app)/page.
export default function RootPage() {
  redirect('/');
}
