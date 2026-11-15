export function EmptyState({ icon = 'bi-inbox', title = 'Nothing here yet', message, action }) {
  return (
    <div className="empty-state">
      <i className={`bi ${icon}`} />
      <h6>{title}</h6>
      {message ? <p className="mb-2" style={{ fontSize: '0.82rem' }}>{message}</p> : null}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading-block">
      <span className="spinner-border spinner-border-sm text-secondary" role="status" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorAlert({ error, onRetry }) {
  if (!error) return null;
  const messages = error.errors?.length
    ? error.errors.map((item) => item.message).join(' ')
    : error.message;

  return (
    <div className="alert alert-danger d-flex align-items-start gap-2">
      <i className="bi bi-exclamation-octagon-fill mt-1" />
      <div className="flex-grow-1">
        <div>{messages || 'Something went wrong.'}</div>
        {onRetry ? (
          <button type="button" className="btn btn-sm btn-outline-brand mt-2" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Pagination({ pagination, onPage }) {
  if (!pagination) return null;
  const { page, pages, total } = pagination;
  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
      <div className="text-muted-2" style={{ fontSize: '0.78rem' }}>
        Page {page} of {pages} · {total} record{total === 1 ? '' : 's'}
      </div>
      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-brand"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <i className="bi bi-chevron-left me-1" />
          Previous
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-brand"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
          <i className="bi bi-chevron-right ms-1" />
        </button>
      </div>
    </div>
  );
}
