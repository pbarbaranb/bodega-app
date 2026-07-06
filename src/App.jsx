import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProductsProvider } from './hooks/useProducts';
import { ToastProvider } from './components/ui/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Venta from './pages/Venta';
import Historial from './pages/Historial';
import Productos from './pages/Productos';
import Compras from './pages/Compras';
import Finanzas from './pages/Finanzas';
import Fiados from './pages/Fiados';

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
                  <Route path="venta"    element={<Venta />} />
                  <Route path="historial" element={<Historial />} />
                  <Route path="productos" element={<Productos />} />
                  <Route path="fiados"   element={<Fiados />} />
                  <Route path="compras"  element={<Compras />} />
                  <Route path="finanzas" element={<Finanzas />} />
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
