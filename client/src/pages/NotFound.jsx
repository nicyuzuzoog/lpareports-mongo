import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="empty-state" style={{ paddingTop: 80 }}>
      <i className="bi bi-signpost-split" />
      <h6>Page not found</h6>
      <p style={{ fontSize: '0.85rem' }}>The page you are looking for does not exist or has moved.</p>
      <Link to="/" className="btn btn-brand btn-sm mt-2">
        <i className="bi bi-arrow-left me-1" />
        Back to dashboard
      </Link>
    </div>
  );
}
