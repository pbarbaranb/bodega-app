import { useEffect, useState } from 'react';
import { supabase, formatMoney, formatDateTime } from '../lib/supabase';
import { Card, CenterModal } from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

const PERIODS = [
  { label: 'Hoy',      value: 'today' },
  { label: 'Semana',   value: 'week'  },
  { label: 'Mes',      value: 'month' },
  { label: 'Todo',     value: 'all'   },
];

function getPeriodDate(period) {
  const now = new Date();
  if (period === 'today') return now.toISOString().split('T')[0];
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }
  if (period === 'month') return now.toISOString().split('T')[0].slice(0, 7);
  return null;
}

export default function Historial() {
  const [loading, setLoading]   = useState(true);
  const [sales, setSales]       = useState([]);
  const [period, setPeriod]     = useState('today');
  const [payFilter, setPayFilter] = useState('');
  const [voucherImg, setVoucherImg] = useState(null);
  const [stats, setStats]       = useState({ total: 0, plin: 0, cash: 0, fiado: 0, count: 0 });
  const [lowStock, setLowStock] = useState([]);

  const load = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    let q = supabase
      .from('ventas')
      .select('*, venta_items(nombre_producto, cantidad, precio_unitario), usuarios(nombre), clientes(nombre)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (payFilter) q = q.eq('metodo_pago', payFilter);

    const periodDate = getPeriodDate(period);
    if (period === 'today')  q = q.gte('created_at', `${today}T00:00:00`);
    else if (period === 'week')  q = q.gte('created_at', `${periodDate}T00:00:00`);
    else if (period === 'month') q = q.gte('created_at', `${periodDate}-01T00:00:00`);

    const [{ data }, { data: low }] = await Promise.all([
      q,
      supabase.from('productos').select('nombre, stock').eq('activo', true).lt('stock', 5).order('stock'),
    ]);

    const all = data || [];
    const sum = (arr) => arr.reduce((a, v) => a + parseFloat(v.total || 0), 0);
    setStats({
      total: sum(all),
      plin:  sum(all.filter((v) => v.metodo_pago === 'plin')),
      cash:  sum(all.filter((v) => v.metodo_pago === 'cash')),
      fiado: sum(all.filter((v) => v.metodo_pago === 'fiado')),
      count: all.length,
    });
    setSales(all);
    setLowStock(low || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [period, payFilter]);

  return (
    <>
      {/* Selector de período */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              period === p.value ? 'bg-bodega text-white' : 'bg-white text-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Stats del período */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm col-span-2">
          <div className="text-[11px] font-bold text-muted">Total ({stats.count} ventas)</div>
          <div className="font-mono text-2xl font-bold text-bodega">{formatMoney(stats.total)}</div>
        </div>
        <div className="rounded-2xl bg-bodega/10 p-3">
          <div className="text-[10px] font-bold text-muted">💚 Yape/Plin</div>
          <div className="font-mono text-base font-bold text-bodega">{formatMoney(stats.plin)}</div>
        </div>
        <div className="rounded-2xl bg-yellow/10 p-3">
          <div className="text-[10px] font-bold text-muted">💵 Efectivo</div>
          <div className="font-mono text-base font-bold text-ink">{formatMoney(stats.cash)}</div>
        </div>
        {stats.fiado > 0 && (
          <div className="rounded-2xl bg-red/10 p-3 col-span-2">
            <div className="text-[10px] font-bold text-muted">📒 Fiado pendiente</div>
            <div className="font-mono text-base font-bold text-red">{formatMoney(stats.fiado)}</div>
          </div>
        )}
      </div>

      {/* Stock bajo */}
      {lowStock.length > 0 && (
        <div className="mb-3 rounded-2xl bg-yellow/10 p-3">
          <div className="mb-2 text-[11px] font-extrabold text-yellow">⚠️ Stock bajo</div>
          {lowStock.map((p) => (
            <div key={p.nombre} className="flex justify-between py-1 text-xs">
              <span className="font-bold">{p.nombre}</span>
              <span className={`font-extrabold ${p.stock === 0 ? 'text-red' : 'text-yellow'}`}>
                {p.stock} uds
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Filtro método de pago */}
      <select
        value={payFilter}
        onChange={(e) => setPayFilter(e.target.value)}
        className="mb-3 w-full rounded-xl bg-white px-3 py-3 text-sm font-bold"
      >
        <option value="">Todos los métodos</option>
        <option value="plin">💚 Yape/Plin</option>
        <option value="cash">💵 Efectivo</option>
        <option value="fiado">📒 Fiado</option>
      </select>

      {/* Lista de ventas */}
      <Card>
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : sales.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-3xl">📋</div>
            <p className="text-sm font-bold text-muted">Sin ventas en este período</p>
          </div>
        ) : (
          sales.map((v) => {
            const items = (v.venta_items || []).map((i) => `${i.cantidad}x ${i.nombre_producto}`).join(', ');
            const isFiado = v.metodo_pago === 'fiado';
            return (
              <div key={v.id} className="border-b border-black/5 py-3 last:border-0">
                <div className="flex justify-between gap-2">
                  <span className="text-xs font-extrabold leading-snug flex-1">{items}</span>
                  <span className={`font-mono text-sm font-bold shrink-0 ${isFiado ? 'text-red' : 'text-bodega'}`}>
                    {formatMoney(v.total)}
                  </span>
                </div>
                {isFiado && v.clientes?.nombre && (
                  <div className="mt-1 text-[10px] font-bold text-red">
                    📒 Fiado: {v.clientes.nombre}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-muted">
                  <span>{formatDateTime(v.created_at)}</span>
                  <span className={`rounded-full px-2 py-0.5 font-extrabold ${
                    v.metodo_pago === 'plin'  ? 'bg-bodega/10 text-bodega' :
                    v.metodo_pago === 'fiado' ? 'bg-red/10 text-red' :
                    'bg-yellow/15 text-yellow'
                  }`}>
                    {v.metodo_pago === 'plin' ? '💚 Yape/Plin' : v.metodo_pago === 'fiado' ? '📒 Fiado' : '💵 Efectivo'}
                  </span>
                  <span>👤 {v.usuarios?.nombre || '—'}</span>
                  {v.voucher_url && (
                    <button onClick={() => setVoucherImg(v.voucher_url)} className="rounded-lg ring-1 ring-black/10">
                      <img src={v.voucher_url} alt="Voucher" className="h-8 w-8 rounded-lg object-cover" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </Card>

      <CenterModal open={!!voucherImg} onClose={() => setVoucherImg(null)} title="Voucher">
        {voucherImg && <img src={voucherImg} alt="Voucher completo" className="w-full rounded-xl" />}
      </CenterModal>
    </>
  );
}