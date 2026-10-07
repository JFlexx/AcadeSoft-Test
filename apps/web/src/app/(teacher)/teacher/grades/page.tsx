'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/empty-state';

type TeacherGroup = {
  id: string;
  name: string;
  course: { name: string; color: string | null };
  students: number;
  assessments: number;
};

/** Teacher app: the groups they teach, to enter grades. */
export default function TeacherGradesPage() {
  const [groups, setGroups] = useState<TeacherGroup[] | null>(null);

  useEffect(() => {
    api<TeacherGroup[]>('/teacher/groups')
      .then(setGroups)
      .catch(() => setGroups([]));
  }, []);

  if (groups === null) return <p className="text-sm text-gray-500">Cargando…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Notas</h1>
      {groups.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No tienes grupos asignados"
          description="Cuando la academia te asigne un grupo podrás poner sus notas aquí."
        />
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/teacher/grades/${g.id}`}
                className="flex items-center gap-3 rounded-xl border bg-white p-3 hover:bg-gray-50"
                style={{ borderLeft: `4px solid ${g.course.color ?? '#6366f1'}` }}
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{g.name}</span>
                  <span className="block text-xs text-gray-500">
                    {g.course.name} · {g.students} alumnos · {g.assessments}{' '}
                    {g.assessments === 1 ? 'evaluación' : 'evaluaciones'}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
