import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Spinner from './ui/Spinner';

export default function ProtectedRoute() {
  const { session, operator, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  if (!operator) return <Navigate to="/login" replace state={{ needOperator: true }} />;

  return <Outlet />;
}
