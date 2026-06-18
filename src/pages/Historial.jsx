import { useEffect, useState } from 'react';
import { supabase, formatMoney, formatDateTime } from '../lib/supabase';
import { Card } from '../components/ui/Modal';
import { CenterModal } from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

export default function Historial() {
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState([]);
  const [filter, setFilter] = useState('');
  const [voucherImg, setVoucherImg] = useState(null);

  const load = async (flt) => {
    setLoading(true);
    let q = supabase
      .from('ventas')
      .select('*, venta_items(nombre_producto, cantidad, precio_unitario), usuarios(nombre)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (flt) q = q.eq('metodo_pago', flt);

    const { data } = await q;
    setSales(data || []);
    setLoading(false);
  };

  useEffect(() => { load(filter); }, [filter]);

  return (
    <>
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-3 w-full rounded-xl bg-white px-3 py-3 text-sm font-bold"
      >
        <option value="">Todos</option>
        <option value="plin">Yape/Plin</option>
        <option value="cash">Efectivo</option>
      </select>

      <Card>
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : sales.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-3xl">📋</div>
            <p className="text-sm font-bold text-muted">Sin ventas</p>
          </div>
        ) : (
          sales.map((v) => {
            const items = (v.venta_items || []).map((i) => `${i.cantidad}x ${i.nombre_producto}`).join(', ');
            return (
              <div key={v.id} className="border-b border-black/5 py-3 last:border-0">
                <div className="flex justify-between gap-2">
                  <span className="text-xs font-extrabold leading-snug">{items}</span>
                  <span className="font-mono text-sm font-bold text-bodega shrink-0">{formatMoney(v.total)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-muted">
                  <span>{formatDateTime(v.created_at)}</span>
                  <span className={`rounded-full px-2 py-0.5 font-extrabold ${
                    v.metodo_pago === 'plin' ? 'bg-bodega/10 text-bodega' : 'bg-yellow/15 text-yellow'
                  }`}>
                    {v.metodo_pago === 'plin' ? '💚 Yape/Plin' : '💵 Efectivo'}
                  </span>
                  <span>👤 {v.usuarios?.nombre || '—'}</span>
                  {v.voucher_url && (
                    <button
                      onClick={() => setVoucherImg(v.voucher_url)}
                      className="rounded-lg ring-1 ring-black/10"
                    >
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
