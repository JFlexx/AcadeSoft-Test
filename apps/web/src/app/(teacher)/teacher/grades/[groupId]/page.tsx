'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { GradesEditor } from '@/components/grades-editor';

export default function TeacherGroupGradesPage() {
  const { groupId } = useParams<{ groupId: string }>();
  return (
    <div className="space-y-4">
      <Link href="/teacher/grades" className="text-sm text-gray-500 hover:underline">
        ← Mis grupos
      </Link>
      <GradesEditor groupId={groupId} basePath="/teacher" />
    </div>
  );
}
