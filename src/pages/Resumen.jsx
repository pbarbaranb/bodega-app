import { useEffect, useState } from 'react';
import { supabase, formatMoney, formatDateTime } from '../lib/supabase';
import { Card } from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

export default function Resumen() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ hoy: 0, mes: 0, plin: 0, cash: 0 });
  const [lowStock, setLowStock] = useState([]);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const month = today.slice(0, 7);

      const [{ data: ventas }, { data: low }] = await Promise.all([
        supabase
          .from('ventas')
          .select('total, metodo_pago, created_at, venta_items(nombre_producto, cantidad), usuarios(nombre)')
          .order('created_at', { ascending: false }),
        supabase
          .from('productos')
          .select('nombre, stock')
          .eq('activo', true)
          .lt('stock', 5)
          .order('stock'),
      ]);

      const all = ventas || [];
      const todayV = all.filter((v) => v.created_at?.startsWith(today));
      const monthV = all.filter((v) => v.created_at?.startsWith(month));
      const sum = (arr) => arr.reduce((a, v) => a + parseFloat(v.total || 0), 0);

      setStats({
        hoy: sum(todayV),
        mes: sum(monthV),
        plin: sum(todayV.filter((v) => v.metodo_pago === 'plin')),
        cash: sum(todayV.filter((v) => v.metodo_pago === 'cash')),
      });
      setLowStock(low || []);
      setRecent(all.slice(0, 5));
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <StatBox label="Ventas hoy" value={formatMoney(stats.hoy)} />
        <StatBox label="Este mes" value={formatMoney(stats.mes)} />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-bodega/10 p-4">
          <div className="text-[11px] font-bold text-muted">💚 Yape/Plin</div>
          <div className="font-mono text-lg font-bold text-bodega">{formatMoney(stats.plin)}</div>
        </div>
        <div className="rounded-2xl bg-yellow/10 p-4">
          <div className="text-[11px] font-bold text-muted">💵 Efectivo</div>
          <div className="font-mono text-lg font-bold text-ink">{formatMoney(stats.cash)}</div>
        </div>
      </div>

      <Card title="⚠️ Stock bajo">
        {lowStock.length === 0 ? (
          <Empty icon="✅" text="Todo en orden" />
        ) : (
          lowStock.map((p) => (
            <div key={p.nombre} className="flex justify-between border-b border-black/5 py-2 last:border-0">
              <span className="text-sm font-bold">{p.nombre}</span>
              <span className={`text-sm font-extrabold ${p.stock === 0 ? 'text-red' : 'text-yellow'}`}>
                ⚠️ {p.stock} uds
              </span>
            </div>
          ))
        )}
      </Card>

      <Card title="Últimas ventas">
        {recent.length === 0 ? (
          <Empty icon="📭" text="Sin ventas aún" />
        ) : (
          recent.map((v) => (
            <SaleRow key={v.id || v.created_at} venta={v} />
          ))
        )}
      </Card>
    </>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-[11px] font-bold text-muted">{label}</div>
      <div className="font-mono text-lg font-bold text-ink">{value}</div>
    </div>
  );
}

function SaleRow({ venta: v }) {
  const items = (v.venta_items || []).map((i) => `${i.cantidad}x ${i.nombre_producto}`).join(', ');
  return (
    <div className="border-b border-black/5 py-3 last:border-0">
      <div className="flex justify-between gap-2">
        <span className="text-xs font-bold leading-snug">{items}</span>
        <span className="font-mono text-sm font-bold text-bodega shrink-0">{formatMoney(v.total)}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        <Badge type={v.metodo_pago}>{v.metodo_pago === 'plin' ? '💚 Yape/Plin' : '💵 Efectivo'}</Badge>
        <Badge>{v.usuarios?.nombre || '—'}</Badge>
      </div>
    </div>
  );
}

function Badge({ children, type }) {
  const cls = type === 'plin' ? 'bg-bodega/10 text-bodega' : type === 'cash' ? 'bg-yellow/15 text-yellow' : 'bg-cream text-muted';
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${cls}`}>{children}</span>;
}

function Empty({ icon, text }) {
  return (
    <div className="py-6 text-center">
      <div className="text-3xl">{icon}</div>
      <p className="mt-1 text-sm font-bold text-muted">{text}</p>
    </div>
  );
}

export { SaleRow, Badge, Empty };
