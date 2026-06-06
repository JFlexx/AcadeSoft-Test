import { ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';

/**
 * Friendly placeholder shown when a list or section has no data yet.
 * Pass an `action` (e.g. a primary button or link) to give the user an
 * obvious next step.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center border border-dashed rounded-xl py-12 px-6 bg-gray-50/50">
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="h-6 w-6" />
      </span>
      <p className="font-medium text-gray-900">{title}</p>
      {description && (
        <p className="text-sm text-gray-500 mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
