import { useEffect, useState } from 'react';
import { supabase, formatMoney } from '../lib/supabase';
import Spinner from '../components/ui/Spinner';
import { Card } from '../components/ui/Modal';

export default function Finanzas() {
  const [loading, setLoading] = useState(true);
  const [data, setData]       = useState(null);

  const load = async () => {
    setLoading(true);
    const [{ data: costos }, { data: ventas }, { data: fiados }] = await Promise.all([
      supabase.from('costos').select('*, productos(nombre, precio, stock)').order('created_at', { ascending: false }),
      supabase.from('ventas').select('total, metodo_pago, estado, created_at, venta_items(producto_id, cantidad, precio_unitario)').neq('metodo_pago', 'fiado'),
      supabase.from('ventas').select('total, estado').eq('metodo_pago', 'fiado').eq('estado', 'pendiente'),
    ]);

    // Mapa de costo por producto (último costo registrado)
    const costoMap = {};
    (costos || []).forEach((c) => {
      if (!costoMap[c.producto_id]) costoMap[c.producto_id] = c;
    });

    // Inversión total (suma de todos los costos registrados)
    const inversionTotal = (costos || []).reduce((s, c) => s + parseFloat(c.costo_total || 0), 0);

    // Ventas reales cobradas
    const today  = new Date().toISOString().split('T')[0];
    const month  = today.slice(0, 7);
    const allV   = ventas || [];
    const sum    = (arr) => arr.reduce((s, v) => s + parseFloat(v.total || 0), 0);
    const ventasHoy  = sum(allV.filter((v) => v.created_at?.startsWith(today)));
    const ventasMes  = sum(allV.filter((v) => v.created_at?.startsWith(month)));
    const ventasTotal = sum(allV);

    // Ganancia real (precio venta - costo de cada item vendido)
    let gananciaReal = 0;
    allV.forEach((v) => {
      (v.venta_items || []).forEach((item) => {
        const costo = costoMap[item.producto_id];
        const cu = costo ? parseFloat(costo.costo_unitario || 0) : 0;
        gananciaReal += (parseFloat(item.precio_unitario) - cu) * item.cantidad;
      });
    });

    // Ganancia potencial (si vendes todo el stock restante)
    let gananciaPotencial = 0;
    Object.values(costoMap).forEach((c) => {
      const pv = parseFloat(c.productos?.precio || 0);
      const cu = parseFloat(c.costo_unitario || 0);
      const stock = parseInt(c.productos?.stock || 0);
      gananciaPotencial += (pv - cu) * stock;
    });

    // Fiados pendientes
    const fiadoTotal = (fiados || []).reduce((s, v) => s + parseFloat(v.total || 0), 0);

    // Por producto — análisis individual
    const byProduct = Object.values(costoMap).map((c) => {
      const pv      = parseFloat(c.productos?.precio || 0);
      const cu      = parseFloat(c.costo_unitario || 0);
      const stock   = parseInt(c.productos?.stock || 0);
      const margen  = pv > 0 ? ((pv - cu) / pv) * 100 : 0;
      const ganUd   = pv - cu;
      const ganStock = ganUd * stock;
      // Punto de equilibrio: cuántas unidades vender para recuperar el costo total
      const puntEq  = ganUd > 0 ? Math.ceil(parseFloat(c.costo_total || 0) / ganUd) : null;
      return { nombre: c.productos?.nombre || '—', pv, cu, margen, ganUd, ganStock, stock, puntEq, costo_total: parseFloat(c.costo_total || 0) };
    }).sort((a, b) => b.margen - a.margen);

    setData({ inversionTotal, ventasHoy, ventasMes, ventasTotal, gananciaReal, gananciaPotencial, fiadoTotal, byProduct });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!data)   return null;

  const { inversionTotal, ventasHoy, ventasMes, ventasTotal, gananciaReal, gananciaPotencial, fiadoTotal, byProduct } = data;
  const roiPct = inversionTotal > 0 ? (gananciaReal / inversionTotal) * 100 : 0;

  const mc = (m) => m >= 30 ? 'text-bodega' : m >= 15 ? 'text-yellow' : 'text-red';
  const mb = (m) => m >= 30 ? 'bg-bodega/10' : m >= 15 ? 'bg-yellow/10' : 'bg-red/10';

  return (
    <>
      {/* KPIs principales */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <KPI label="Inversión total" value={formatMoney(inversionTotal)} color="text-ink" />
        <KPI label="Ganancia real" value={formatMoney(gananciaReal)} color={gananciaReal >= 0 ? 'text-bodega' : 'text-red'} />
        <KPI label="Ganancia potencial" value={formatMoney(gananciaPotencial)} color="text-bodega" sub="si vendes todo el stock" />
        <KPI label="ROI" value={`${roiPct.toFixed(1)}%`} color={roiPct >= 20 ? 'text-bodega' : roiPct >= 0 ? 'text-yellow' : 'text-red'} sub="retorno sobre inversión" />
      </div>

      {/* Ventas por período */}
      <Card title="💰 Ventas cobradas">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {[['Hoy', ventasHoy], ['Este mes', ventasMes], ['Total', ventasTotal]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-cream p-3">
              <div className="font-bold text-muted">{l}</div>
              <div className="font-mono font-extrabold text-bodega mt-1">{formatMoney(v)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Fiados */}
      {fiadoTotal > 0 && (
        <div className="mb-3 rounded-2xl bg-red/10 p-4">
          <div className="text-[11px] font-bold text-muted">📒 Fiados pendientes de cobro</div>
          <div className="font-mono text-xl font-bold text-red">{formatMoney(fiadoTotal)}</div>
          <div className="text-[10px] text-muted mt-1">Este dinero aún no ha ingresado a caja</div>
        </div>
      )}

      {/* Semáforo de rentabilidad */}
      <Card title="🚦 Rentabilidad por producto">
        {byProduct.length === 0 ? (
          <p className="py-4 text-center text-sm font-bold text-muted">Sin costos registrados</p>
        ) : (
          byProduct.map((p) => (
            <div key={p.nombre} className={`mb-2 rounded-xl p-3 ${mb(p.margen)}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-extrabold truncate">{p.nombre}</div>
                  <div className="text-[10px] text-muted mt-0.5">
                    Costo: {formatMoney(p.cu)} · Venta: {formatMoney(p.pv)} · Stock: {p.stock} uds
                  </div>
                </div>
                <div className={`font-mono text-lg font-extrabold shrink-0 ${mc(p.margen)}`}>
                  {p.margen.toFixed(0)}%
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px]">
                <div>
                  <div className="text-muted font-bold">Gan./ud</div>
                  <div className={`font-mono font-extrabold ${p.ganUd >= 0 ? 'text-bodega' : 'text-red'}`}>{formatMoney(p.ganUd)}</div>
                </div>
                <div>
                  <div className="text-muted font-bold">Gan. potencial</div>
                  <div className="font-mono font-extrabold text-bodega">{formatMoney(p.ganStock)}</div>
                </div>
                <div>
                  <div className="text-muted font-bold">Punto equilibrio</div>
                  <div className="font-mono font-extrabold">{p.puntEq != null ? `${p.puntEq} uds` : '—'}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </Card>

      {/* Alertas */}
      {byProduct.filter((p) => p.margen < 15).length > 0 && (
        <Card title="⚠️ Productos con margen bajo">
          {byProduct.filter((p) => p.margen < 15).map((p) => (
            <div key={p.nombre} className="flex justify-between border-b border-black/5 py-2 last:border-0">
              <span className="text-sm font-bold">{p.nombre}</span>
              <span className="font-mono text-sm font-bold text-red">{p.margen.toFixed(0)}%</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function KPI({ label, value, color, sub }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-[11px] font-bold text-muted">{label}</div>
      <div className={`font-mono text-xl font-extrabold ${color}`}>{value}</div>
      {sub && <div className="text-[9px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}