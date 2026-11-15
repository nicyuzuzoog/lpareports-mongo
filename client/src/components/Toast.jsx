import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

const ICONS = {
  success: 'bi-check-circle-fill',
  danger: 'bi-exclamation-octagon-fill',
  warning: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill'
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (message, type = 'success', timeout = 4200) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((items) => [...items, { id, message, type }]);
      if (timeout) window.setTimeout(() => remove(id), timeout);
    },
    [remove]
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack position-fixed top-0 end-0 p-3" style={{ zIndex: 2000 }}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`alert alert-${toast.type} d-flex align-items-start gap-2 shadow-sm mb-2`}
            role="alert"
            style={{ minWidth: 280, maxWidth: 400 }}
          >
            <i className={`bi ${ICONS[toast.type] || ICONS.info} mt-1`} />
            <div className="flex-grow-1">{toast.message}</div>
            <button
              type="button"
              className="btn-close btn-close-sm"
              aria-label="Close"
              onClick={() => remove(toast.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider.');
  return context;
}
