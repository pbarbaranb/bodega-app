import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/ui/Toast';
import { AVATARS } from '../lib/supabase';
import { Btn, Input } from '../components/ui/Modal';
import { LogoutButton } from '../components/Layout';
import Spinner from '../components/ui/Spinner';

export default function Login() {
  const { session, operator, signIn, switchOperator, usuarios, loading, loadUsuarios } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [selUser, setSelUser]       = useState(null);
  const [pin, setPin]               = useState('');
  const [pinError, setPinError]     = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const needOperator = location.state?.needOperator || (session && !operator);

  // Cargar usuarios cuando hay sesión pero no hay operador seleccionado
  useEffect(() => {
    if (session && needOperator && usuarios.length === 0) {
      setLoadingUsers(true);
      loadUsuarios().finally(() => setLoadingUsers(false));
    }
  }, [session, needOperator]);

  if (!loading && session && operator && !needOperator) {
    navigate('/venta', { replace: true });
    return null;
  }

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!email || !password) { showToast('Ingresa email y contraseña', 'error'); return; }
    setAuthLoading(true);
    try {
      await signIn(email, password);
      showToast('Sesión iniciada', 'success');
    } catch (err) {
      showToast(err.message || 'Error al iniciar sesión', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePinKey = (key) => {
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    setPinError('');
    if (next.length === 4) verifyPin(next);
  };

  const verifyPin = async (pinVal) => {
    if (!selUser) return;
    setPinLoading(true);
    try {
      const user = await switchOperator(selUser.id, pinVal);
      showToast(`Hola, ${user.nombre}!`, 'success');
      navigate('/venta', { replace: true });
    } catch {
      setPinError('PIN incorrecto');
      setPin('');
    } finally {
      setPinLoading(false);
    }
  };

  const selectUser  = (user) => { setSelUser(user); setPin(''); setPinError(''); };
  const pinDel      = () => setPin((p) => p.slice(0, -1));
  const cancelPin   = () => { setSelUser(null); setPin(''); setPinError(''); };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-cream"><Spinner size="lg" /></div>;
  }

  if (session && needOperator) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col items-center bg-cream px-5 py-10">
        <div className="mb-2 text-5xl">🛒</div>
        <h1 className="text-2xl font-black text-ink">Mi Bodega</h1>
        <p className="mb-6 text-sm font-bold text-muted">¿Quién registra la venta?</p>

        {/* Loading de usuarios */}
        {loadingUsers ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Spinner size="lg" />
            <p className="text-sm font-bold text-muted">Cargando usuarios...</p>
          </div>
        ) : usuarios.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-bold text-red">No se encontraron usuarios</p>
            <button
              onClick={() => { setLoadingUsers(true); loadUsuarios().finally(() => setLoadingUsers(false)); }}
              className="mt-3 text-xs font-bold text-bodega underline"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <div className="mb-4 grid w-full grid-cols-3 gap-3">
            {usuarios.map((u) => (
              <button
                key={u.id}
                onClick={() => selectUser(u)}
                className={`rounded-2xl bg-white p-4 text-center shadow-sm transition active:scale-95 ${
                  selUser?.id === u.id ? 'ring-2 ring-bodega' : ''
                }`}
              >
                <div className="text-3xl">{AVATARS[u.nombre] || '👤'}</div>
                <div className="mt-1 text-xs font-extrabold">{u.nombre}</div>
                <div className="text-[10px] font-bold text-muted">
                  {u.rol === 'admin' ? 'Admin' : 'Vendedor'}
                </div>
              </button>
            ))}
          </div>
        )}

        {selUser && (
          <div className="w-full">
            <p className="mb-3 text-center text-sm font-bold text-muted">PIN de {selUser.nombre}</p>
            <div className="mb-4 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`h-3 w-3 rounded-full ${i < pin.length ? 'bg-bodega' : 'bg-white ring-1 ring-black/10'}`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['1','2','3','4','5','6','7','8','9','←','0','⌫'].map((k) => (
                <button
                  key={k}
                  onClick={() => { if (k === '←') cancelPin(); else if (k === '⌫') pinDel(); else handlePinKey(k); }}
                  disabled={pinLoading}
                  className={`flex h-14 items-center justify-center rounded-xl bg-white text-lg font-extrabold shadow-sm active:scale-95 ${k === '⌫' ? 'text-red' : 'text-ink'}`}
                >
                  {k}
                </button>
              ))}
            </div>
            {pinError && <p className="mt-3 text-center text-sm font-bold text-red">{pinError}</p>}
          </div>
        )}

        <div className="mt-8"><LogoutButton /></div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[480px] flex-col items-center justify-center bg-cream px-5">
      <div className="mb-2 text-5xl">🛒</div>
      <h1 className="text-2xl font-black text-ink">Mi Bodega</h1>
      <p className="mb-8 text-sm font-bold text-muted">Inicia sesión para continuar</p>
      <form onSubmit={handleAuth} className="w-full">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email" />
        <Input label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        <Btn type="submit" disabled={authLoading}>{authLoading ? 'Ingresando...' : 'Ingresar'}</Btn>
      </form>
    </div>
  );
}