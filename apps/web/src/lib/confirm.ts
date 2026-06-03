import { toast } from 'sonner';

/**
 * Promise-based confirmation built on a sonner toast with action/cancel
 * buttons — a non-blocking, on-brand replacement for window.confirm().
 *
 * Resolves true only if the user clicks the confirm action; dismissing,
 * cancelling or letting it auto-close resolves false (safe for destructive
 * actions).
 */
export function confirmToast(
  message: string,
  opts: { confirmLabel?: string; cancelLabel?: string; description?: string } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    let decided = false;
    const settle = (value: boolean) => {
      if (decided) return;
      decided = true;
      resolve(value);
    };

    toast(message, {
      description: opts.description,
      duration: 12_000,
      action: {
        label: opts.confirmLabel ?? 'Confirmar',
        onClick: () => settle(true),
      },
      cancel: {
        label: opts.cancelLabel ?? 'Cancelar',
        onClick: () => settle(false),
      },
      onDismiss: () => settle(false),
      onAutoClose: () => settle(false),
    });
  });
}
