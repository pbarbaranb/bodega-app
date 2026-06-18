import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AdminGate({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/venta" replace />;
  return children;
}
