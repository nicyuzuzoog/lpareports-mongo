import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function FullPageLoading({ label = 'Loading your workspace…' }) {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
      <div className="spinner-border text-primary" role="status" style={{ color: '#123a63' }} />
      <p className="text-muted-2 mt-3 mb-0" style={{ fontSize: '0.85rem' }}>{label}</p>
    </div>
  );
}

export default function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
