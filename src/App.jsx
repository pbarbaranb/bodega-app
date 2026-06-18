import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProductsProvider } from './hooks/useProducts';
import { ToastProvider } from './components/ui/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import AdminGate from './components/AdminGate';
import Layout from './components/Layout';
import Login from './pages/Login';
import Venta from './pages/Venta';
import Resumen from './pages/Resumen';
import Historial from './pages/Historial';
import Productos from './pages/Productos';
import Costos from './pages/Costos';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProductsProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<Navigate to="/venta" replace />} />
                  <Route path="venta" element={<Venta />} />
                  <Route path="resumen" element={<Resumen />} />
                  <Route path="historial" element={<Historial />} />
                  <Route path="productos" element={<AdminGate><Productos /></AdminGate>} />
                  <Route path="costos" element={<AdminGate><Costos /></AdminGate>} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/venta" replace />} />
            </Routes>
          </ToastProvider>
        </ProductsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
