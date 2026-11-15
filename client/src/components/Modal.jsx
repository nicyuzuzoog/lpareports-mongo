import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ show, onClose, title, subtitle, children, footer, size = 'md', closeOnBackdrop = true }) {
  useEffect(() => {
    if (!show) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [show, onClose]);

  if (!show) return null;

  return createPortal(
    <>
      <div
        className="modal fade show d-block"
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => {
          if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
        }}
      >
        <div className={`modal-dialog modal-${size} modal-dialog-centered modal-dialog-scrollable`}>
          <div className="modal-content border-0 shadow">
            <div className="modal-header">
              <div>
                <h5 className="modal-title">{title}</h5>
                {subtitle ? <div className="text-muted-2" style={{ fontSize: '0.75rem' }}>{subtitle}</div> : null}
              </div>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">{children}</div>
            {footer ? <div className="modal-footer">{footer}</div> : null}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>,
    document.body
  );
}
