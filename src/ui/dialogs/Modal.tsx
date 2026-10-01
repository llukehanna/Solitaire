import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useSheetDrag } from './sheetDrag';

interface ModalProps {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Modal({ open, title, onClose, children, actions, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const card = useRef<HTMLDivElement>(null);
  const drag = useSheetDrag(card, open, onClose);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal ${className ?? ''}`}
      aria-labelledby={titleId}
      onClose={() => open && onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
    >
      <div className="modal-card" ref={card}>
        <div className="sheet-grab" {...drag}>
          <div className="sheet-handle" aria-hidden="true" />
          <h2 id={titleId}>{title}</h2>
        </div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </dialog>
  );
}
