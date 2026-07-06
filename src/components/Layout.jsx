import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AVATARS } from '../lib/supabase';

const TABS = [
  { to: '/venta',     label: '🛍️ Venta',    end: true, adminOnly: false },
  { to: '/historial', label: '📋 Historial',             adminOnly: false },
  { to: '/productos', label: '📦 Productos',             adminOnly: false },
  { to: '/fiados',    label: '📒 Fiados',               adminOnly: false },
  { to: '/compras',   label: '🏪 Compras',              adminOnly: true  },
  { to: '/finanzas',  label: '📈 Finanzas',             adminOnly: true  },
];

export default function Layout() {
  const { operator, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSwitch = () => {
    sessionStorage.removeItem('bodega_operator');
    navigate('/login', { state: { needOperator: true } });
  };

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-black/5 bg-cream/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{AVATARS[operator?.nombre] || '👤'}</span>
          <div>
            <div className="text-sm font-extrabold text-ink">{operator?.nombre || '—'}</div>
            <div className="text-[11px] font-bold text-muted">
              {isAdmin ? '⭐ Admin' : '🛍️ Vendedor'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSwitch}
            className="rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-bodega shadow-sm"
          >
            Cambiar
          </button>
          <button
            onClick={signOut}
            className="rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-red shadow-sm"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Nav */}
      <nav className="sticky top-[60px] z-30 flex overflow-x-auto border-b border-black/5 bg-cream/95 backdrop-blur scrollbar-hide">
        {visibleTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `shrink-0 whitespace-nowrap px-3 py-3 text-[11px] font-extrabold transition ${
                isActive
                  ? 'border-b-2 border-bodega text-bodega'
                  : 'text-muted'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-4 pb-8">
        <Outlet />
      </main>
    </div>
  );
}