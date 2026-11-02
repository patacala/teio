import { toast as sonnerToast } from 'sonner';

export type ToastVariant = 'default' | 'info' | 'ai' | 'error' | 'warning';

export interface ToastItem {
  id?: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export function toast(item: Omit<ToastItem, 'id'>) {
  const { title, description, variant = 'default', duration, action } = item;
  const opts = {
    description,
    duration,
    ...(action ? { action: { label: action.label, onClick: action.onClick } } : {}),
  };

  switch (variant) {
    case 'error':
      sonnerToast.error(title, opts);
      break;
    case 'info':
      sonnerToast.info(title, opts);
      break;
    case 'warning':
      sonnerToast.warning(title, opts);
      break;
    case 'ai':
      sonnerToast(title, opts);
      break;
    default:
      sonnerToast.success(title, opts);
      break;
  }
}
