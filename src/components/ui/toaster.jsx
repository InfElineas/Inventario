import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, onClose, onOpenChange, ...props }) => (
        <Toast key={id} {...props}>
          <div className="grid gap-1">
            {title       && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          {/* Al hacer clic en X: llamar onClose (marcar como leída) y luego cerrar */}
          <ToastClose
            onClick={() => {
              onClose?.();
              dismiss(id);
            }}
          />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
