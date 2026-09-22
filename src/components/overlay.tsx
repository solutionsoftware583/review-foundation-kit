import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/**
 * Accessible overlay shell built on Radix Dialog: focus trap, focus restore,
 * Escape handling, outside-click close, dialog role/name and background inertness.
 * Visuals stay with the caller through `className` on the panel.
 */
export function Overlay({
  title,
  description,
  onClose,
  className,
  overlayClassName,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  className?: string;
  overlayClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn("fixed inset-0 z-50 bg-overlay/60 backdrop-blur-sm", overlayClassName)} />
        <DialogPrimitive.Content className={cn("fixed z-50 outline-none", className)}>
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{description ?? title}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
