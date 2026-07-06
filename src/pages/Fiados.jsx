import { useEffect, useState } from 'react';
import { supabase, formatMoney, formatDateTime } from '../lib/supabase';
import { Card, CenterModal, Btn, Input } from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';

export default function Fiados() {
  const { showToast } = useToast();
  const [loading, setLoading]   = useState(true);
  const [clientes, setClientes] = useState([]);
  const [selected, setSelected] = useState(null); // cliente seleccionado
  const [deudas, setDeudas]     = useState([]);   // ventas pendientes del cliente
  const [pagos, setPagos]       = useState([]);   // pagos ya hechos
  const [pagoOpen, setPagoOpen] = useState(false);
  const [montoPago, setMontoPago] = useState('');
  const [metodoPago, setMetodoPago] = useState('cash');
  const [notaPago, setNotaPago]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [filter, setFilter]       = useState('pendientes'); // 'pendientes' | 'todos'

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ventas')
      .select('id, total, created_at, estado, cliente_id, venta_items(nombre_producto, cantidad), clientes(id, nombre, telefono)')
      .eq('metodo_pago', 'fiado')
      .order('created_at', { ascending: false });

    // Agrupar por cliente
    const map = {};
    (data || []).forEach((v) => {
      const c = v.clientes;
      if (!c) return;
      if (!map[c.id]) map[c.id] = { ...c, ventas: [], totalDeuda: 0 };
      map[c.id].ventas.push(v);
      if (v.estado === 'pendiente') map[c.id].totalDeuda += parseFloat(v.total || 0);
    });

    const list = Object.values(map);
    if (filter === 'pendientes') {
      setClientes(list.filter((c) => c.totalDeuda > 0));
    } else {
      setClientes(list);
    }
    setLoading(false);
  };

  const loadDetalle = async (cliente) => {
    setSelected(cliente);
    const [{ data: deudasData }, { data: pagosData }] = await Promise.all([
      supabase.from('ventas').select('*, venta_items(nombre_producto, cantidad)').eq('cliente_id', cliente.id).eq('metodo_pago', 'fiado').order('created_at', { ascending: false }),
      supabase.from('fiado_pagos').select('*').eq('cliente_id', cliente.id).order('created_at', { ascending: false }),
    ]);
    setDeudas(deudasData || []);
    setPagos(pagosData || []);
  };

  useEffect(() => { load(); }, [filter]);

  const totalPagado = pagos.reduce((s, p) => s + parseFloat(p.monto || 0), 0);
  const totalDeuda  = deudas.reduce((s, v) => s + (v.estado === 'pendiente' ? parseFloat(v.total || 0) : 0), 0);
  const saldoPendiente = Math.max(0, totalDeuda - totalPagado);

  const registrarPago = async () => {
    const monto = parseFloat(montoPago);
    if (!monto || monto <= 0) { showToast('Ingresa un monto válido', 'error'); return; }
    if (monto > saldoPendiente + 0.01) { showToast(`El monto no puede superar la deuda (${formatMoney(saldoPendiente)})`, 'error'); return; }
    setSaving(true);
    try {
      // Registrar el pago
      await supabase.from('fiado_pagos').insert({
        cliente_id: selected.id,
        monto,
        metodo_pago: metodoPago,
        nota: notaPago.trim() || null,
      });

      // Si el pago cubre toda la deuda restante, marcar ventas como pagadas
      let restante = monto;
      for (const v of deudas.filter((d) => d.estado === 'pendiente')) {
        if (restante <= 0) break;
        const montoVenta = parseFloat(v.total);
        if (restante >= montoVenta) {
          await supabase.from('ventas').update({ estado: 'pagado' }).eq('id', v.id);
          restante -= montoVenta;
        }
      }

      showToast(`✅ Pago de ${formatMoney(monto)} registrado`, 'success');
      setPagoOpen(false);
      setMontoPago('');
      setNotaPago('');
      await loadDetalle(selected);
      await load();
    } catch { showToast('Error registrando pago', 'error'); } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  // Vista detalle de un cliente
  if (selected) {
    return (
      <>
        <button onClick={() => setSelected(null)} className="mb-3 flex items-center gap-1 text-sm font-bold text-bodega">
          ← Volver
        </button>

        {/* Resumen del cliente */}
        <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-lg font-extrabold">{selected.nombre}</div>
          {selected.telefono && <div className="text-xs font-bold text-muted">{selected.telefono}</div>}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-red/10 p-2">
              <div className="font-bold text-muted">Deuda total</div>
              <div className="font-mono font-extrabold text-red">{formatMoney(totalDeuda)}</div>
            </div>
            <div className="rounded-xl bg-bodega/10 p-2">
              <div className="font-bold text-muted">Pagado</div>
              <div className="font-mono font-extrabold text-bodega">{formatMoney(totalPagado)}</div>
            </div>
            <div className={`rounded-xl p-2 ${saldoPendiente > 0 ? 'bg-red/10' : 'bg-bodega/10'}`}>
              <div className="font-bold text-muted">Pendiente</div>
              <div className={`font-mono font-extrabold ${saldoPendiente > 0 ? 'text-red' : 'text-bodega'}`}>{formatMoney(saldoPendiente)}</div>
            </div>
          </div>
        </div>

        {saldoPendiente > 0 && (
          <Btn onClick={() => { setMontoPago(saldoPendiente.toFixed(2)); setPagoOpen(true); }} className="mb-3">
            💵 Registrar pago
          </Btn>
        )}

        {/* Historial de compras fiadas */}
        <Card title="Compras fiadas">
          {deudas.map((v) => (
            <div key={v.id} className="border-b border-black/5 py-3 last:border-0">
              <div className="flex justify-between gap-2">
                <span className="text-xs font-bold">{(v.venta_items || []).map((i) => `${i.cantidad}x ${i.nombre_producto}`).join(', ')}</span>
                <span className="font-mono text-sm font-bold shrink-0">{formatMoney(v.total)}</span>
              </div>
              <div className="mt-1 flex gap-2 text-[10px]">
                <span className="text-muted">{formatDateTime(v.created_at)}</span>
                <span className={`rounded-full px-2 py-0.5 font-extrabold ${v.estado === 'pagado' ? 'bg-bodega/10 text-bodega' : 'bg-red/10 text-red'}`}>
                  {v.estado === 'pagado' ? '✅ Pagado' : '⏳ Pendiente'}
                </span>
              </div>
            </div>
          ))}
        </Card>

        {/* Historial de pagos */}
        {pagos.length > 0 && (
          <Card title="Pagos recibidos">
            {pagos.map((p) => (
              <div key={p.id} className="flex justify-between border-b border-black/5 py-2 last:border-0 text-sm">
                <div>
                  <div className="font-bold">{formatDateTime(p.created_at)}</div>
                  <div className="text-xs text-muted">{p.metodo_pago === 'plin' ? '💚 Yape/Plin' : '💵 Efectivo'}{p.nota ? ` · ${p.nota}` : ''}</div>
                </div>
                <span className="font-mono font-bold text-bodega">{formatMoney(p.monto)}</span>
              </div>
            ))}
          </Card>
        )}

        {/* Modal de pago */}
        <CenterModal open={pagoOpen} onClose={() => setPagoOpen(false)} title="Registrar pago">
          <div className="mb-3 rounded-xl bg-red/10 p-3 text-center">
            <div className="text-xs font-bold text-muted">Saldo pendiente</div>
            <div className="font-mono text-2xl font-bold text-red">{formatMoney(saldoPendiente)}</div>
          </div>
          <Input label="Monto a pagar (S/)" type="number" step="0.50" value={montoPago} onChange={(e) => setMontoPago(e.target.value)} />
          <div className="mb-3">
            <label className="mb-1 block text-[11px] font-bold uppercase text-muted">Método de pago</label>
            <div className="grid grid-cols-2 gap-2">
              {[['cash', '💵 Efectivo'], ['plin', '💚 Yape/Plin']].map(([val, label]) => (
                <button key={val} onClick={() => setMetodoPago(val)}
                  className={`rounded-xl py-3 text-xs font-extrabold ${metodoPago === val ? 'bg-bodega text-white' : 'bg-cream text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Input label="Nota (opcional)" placeholder="Ej: Abono del fin de semana" value={notaPago} onChange={(e) => setNotaPago(e.target.value)} />
          <Btn disabled={saving} onClick={registrarPago}>{saving ? 'Guardando...' : '✅ Confirmar pago'}</Btn>
          <Btn variant="ghost" onClick={() => setPagoOpen(false)}>Cancelar</Btn>
        </CenterModal>
      </>
    );
  }

  // Lista de clientes
  return (
    <>
      <div className="mb-3 flex gap-2">
        {[['pendientes', 'Con deuda'], ['todos', 'Todos']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`rounded-xl px-4 py-2 text-xs font-extrabold ${filter === val ? 'bg-bodega text-white' : 'bg-white text-muted'}`}>
            {label}
          </button>
        ))}
      </div>

      <Card>
        {clientes.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-3xl">📒</div>
            <p className="text-sm font-bold text-muted">{filter === 'pendientes' ? 'Sin deudas pendientes ✅' : 'Sin fiados registrados'}</p>
          </div>
        ) : (
          clientes.map((c) => (
            <button key={c.id} onClick={() => loadDetalle(c)} className="w-full border-b border-black/5 py-3 last:border-0 text-left">
              <div className="flex justify-between gap-2">
                <div>
                  <div className="text-sm font-extrabold">{c.nombre}</div>
                  {c.telefono && <div className="text-[10px] text-muted">{c.telefono}</div>}
                </div>
                <div className="text-right">
                  <div className={`font-mono text-sm font-bold ${c.totalDeuda > 0 ? 'text-red' : 'text-bodega'}`}>
                    {formatMoney(c.totalDeuda)}
                  </div>
                  <div className="text-[10px] text-muted">{c.totalDeuda > 0 ? 'pendiente' : 'al día ✅'}</div>
                </div>
              </div>
            </button>
          ))
        )}
      </Card>
    </>
  );
}