import { useEffect, useState, useRef } from 'react';
import { supabase, formatMoney } from '../lib/supabase';
import { callClaude, parseClaudeJson, fileToBase64 } from '../lib/claude';
import { useToast } from '../components/ui/Toast';
import { Card, CenterModal, Btn, Input, Select } from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

export default function Costos() {
  const { showToast } = useToast();
  const [costos, setCostos] = useState([]);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({ ganancia: 0, margen: 0 });
  const [loading, setLoading] = useState(true);

  const [manualOpen, setManualOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ producto_id: '', proveedor: '', costo_total: '', unidades: '1' });
  const [preview, setPreview] = useState(null);

  const [scanStep, setScanStep] = useState(1);
  const [scanPhoto, setScanPhoto] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [extracted, setExtracted] = useState({ proveedor: '', items: [] });
  const ticketRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [{ data: costData }, { data: prods }, { data: ventas }] = await Promise.all([
      supabase
        .from('costos')
        .select('*, productos(nombre, precio)')
        .order('created_at', { ascending: false }),
      supabase.from('productos').select('id, nombre, precio').eq('activo', true).order('nombre'),
      supabase
        .from('ventas')
        .select('total, created_at, venta_items(producto_id, cantidad, precio_unitario)')
        .gte('created_at', `${today}T00:00:00`),
    ]);

    setCostos(costData || []);
    setProducts(prods || []);

    const margins = (costData || []).map((c) => {
      const precio = c.productos?.precio || 0;
      const costoUd = c.costo_unitario || (c.costo_total / (c.unidades || 1));
      return precio > 0 ? ((precio - costoUd) / precio) * 100 : 0;
    });
    const avgMargen = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;

    let ganancia = 0;
    (ventas || []).forEach((v) => {
      (v.venta_items || []).forEach((item) => {
        const cost = (costData || []).find((c) => c.producto_id === item.producto_id);
        const costoUd = cost ? (cost.costo_unitario || cost.costo_total / (cost.unidades || 1)) : 0;
        ganancia += (item.precio_unitario - costoUd) * item.cantidad;
      });
    });

    setStats({ ganancia, margen: avgMargen });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const calcPreview = () => {
    const prod = products.find((p) => p.id === parseInt(manualForm.producto_id));
    const costoTotal = parseFloat(manualForm.costo_total) || 0;
    const unidades = parseInt(manualForm.unidades) || 1;
    const costoUd = costoTotal / unidades;
    const precio = prod?.precio || 0;
    const margen = precio > 0 ? ((precio - costoUd) / precio) * 100 : 0;
    setPreview({ costoUd, precio, margen });
  };

  useEffect(() => { calcPreview(); }, [manualForm, products]);

  const saveManual = async () => {
    const { producto_id, proveedor, costo_total, unidades } = manualForm;
    if (!producto_id || !costo_total) {
      showToast('Completa producto y costo', 'error');
      return;
    }
    const u = parseInt(unidades) || 1;
    const ct = parseFloat(costo_total);
    const { error } = await supabase.from('costos').insert({
      producto_id: parseInt(producto_id),
      proveedor: proveedor.trim(),
      costo_total: ct,
      unidades: u,
      costo_unitario: ct / u,
    });
    if (error) { showToast('Error guardando costo', 'error'); return; }
    showToast('Costo registrado', 'success');
    setManualOpen(false);
    load();
  };

  const onTicketPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await fileToBase64(file);
    setScanPhoto(data);
  };

  
const scanTicket = async () => {
    if (!scanPhoto) return;
    setScanStep(2);
    setScanning(true);
    const prompt = `Analiza este ticket de compra de bodega/tienda peruana.
Extrae el nombre del proveedor y una lista de productos con costo total y unidades.
Responde SOLO JSON sin backticks:
{"proveedor":"","items":[{"nombre":"","costo_total":0,"unidades":1}]}`;

    try {
      const raw = await callClaude(prompt, scanPhoto.base64, scanPhoto.mime);
      console.log('RESPUESTA CRUDA DE GEMINI:', raw);
      const data = parseClaudeJson(raw);
      setExtracted({
        proveedor: data.proveedor || '',
        items: (data.items || []).map((i) => ({
          nombre: i.nombre || '',
          costo_total: i.costo_total || 0,
          unidades: i.unidades || 1,
          producto_id: '',
        })),
      });
      setScanStep(3);
    } catch (err) {
      console.error('ERROR COMPLETO:', err);
      showToast(err.message || 'No se pudo leer el ticket', 'error');
      setScanStep(1);
    } finally {
      setScanning(false);
    }
  };

  const saveExtracted = async () => {
    const valid = extracted.items.filter((i) => i.producto_id && i.costo_total);
    if (!valid.length) {
      showToast('Asigna al menos un producto', 'error');
      return;
    }
    for (const item of valid) {
      await supabase.from('costos').insert({
        producto_id: parseInt(item.producto_id),
        proveedor: extracted.proveedor.trim(),
        costo_total: parseFloat(item.costo_total),
        unidades: parseInt(item.unidades) || 1,
        costo_unitario: parseFloat(item.costo_total) / (parseInt(item.unidades) || 1),
      });
    }
    showToast(`${valid.length} costos guardados`, 'success');
    setScanOpen(false);
    setScanStep(1);
    setScanPhoto(null);
    load();
  };

  const marginColor = (m) => (m >= 30 ? 'text-bodega' : m >= 15 ? 'text-yellow' : 'text-red');

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  const latestByProduct = {};
  costos.forEach((c) => {
    if (!latestByProduct[c.producto_id]) latestByProduct[c.producto_id] = c;
  });

  return (
    <>
      <div className="mb-3 flex gap-2">
        <Btn className="mt-0 flex-1" onClick={() => { setScanOpen(true); setScanStep(1); setScanPhoto(null); }}>
          📷 Escanear ticket
        </Btn>
        <Btn variant="ghost" className="mt-0 flex-1" onClick={() => {
          setManualForm({ producto_id: products[0]?.id || '', proveedor: '', costo_total: '', unidades: '1' });
          setManualOpen(true);
        }}>
          + Agregar manual
        </Btn>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold text-muted">Ganancia hoy</div>
          <div className="font-mono text-lg font-bold text-bodega">{formatMoney(stats.ganancia)}</div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold text-muted">Margen promedio</div>
          <div className={`font-mono text-lg font-bold ${marginColor(stats.margen)}`}>
            {stats.margen.toFixed(1)}%
          </div>
        </div>
      </div>

      <Card title="Productos con costos registrados">
        {Object.values(latestByProduct).length === 0 ? (
          <p className="py-6 text-center text-sm font-bold text-muted">Sin costos registrados</p>
        ) : (
          Object.values(latestByProduct).map((c) => {
            const precio = c.productos?.precio || 0;
            const costoUd = c.costo_unitario || c.costo_total / (c.unidades || 1);
            const margen = precio > 0 ? ((precio - costoUd) / precio) * 100 : 0;
            return (
              <div key={c.id} className="flex justify-between border-b border-black/5 py-3 last:border-0">
                <div>
                  <div className="text-sm font-extrabold">{c.productos?.nombre}</div>
                  <div className="text-[11px] font-bold text-muted">
                    Costo/ud {formatMoney(costoUd)} · Venta {formatMoney(precio)}
                  </div>
                </div>
                <div className={`font-mono text-sm font-bold ${marginColor(margen)}`}>
                  {margen.toFixed(0)}%
                </div>
              </div>
            );
          })
        )}
      </Card>

      {/* Manual modal */}
      <CenterModal open={manualOpen} onClose={() => setManualOpen(false)} title="Registrar costo">
        <Select label="Producto" value={manualForm.producto_id} onChange={(e) => setManualForm({ ...manualForm, producto_id: e.target.value })}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Select>
        <Input label="Proveedor" value={manualForm.proveedor} onChange={(e) => setManualForm({ ...manualForm, proveedor: e.target.value })} placeholder="Ej: Distribuidora El Sol" />
        <Input label="Precio costo total (S/)" type="number" step="0.01" value={manualForm.costo_total} onChange={(e) => setManualForm({ ...manualForm, costo_total: e.target.value })} />
        <Input label="Unidades compradas" type="number" min="1" value={manualForm.unidades} onChange={(e) => setManualForm({ ...manualForm, unidades: e.target.value })} />
        {preview && (
          <div className="mb-3 rounded-xl bg-cream p-3">
            <div className="mb-2 text-xs font-extrabold text-muted">Vista previa</div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><div className="font-bold text-muted">Costo/ud</div><div className="font-mono font-bold">{formatMoney(preview.costoUd)}</div></div>
              <div><div className="font-bold text-muted">Precio venta</div><div className="font-mono font-bold text-bodega">{formatMoney(preview.precio)}</div></div>
              <div><div className="font-bold text-muted">Margen</div><div className={`font-mono font-bold ${marginColor(preview.margen)}`}>{preview.margen.toFixed(1)}%</div></div>
            </div>
          </div>
        )}
        <Btn onClick={saveManual}>Guardar costo</Btn>
        <Btn variant="ghost" onClick={() => setManualOpen(false)}>Cancelar</Btn>
      </CenterModal>

      {/* Scan modal */}
      <CenterModal open={scanOpen} onClose={() => setScanOpen(false)} title="📷 Escanear ticket de compra">
        {scanStep === 1 && (
          <>
            <button type="button" onClick={() => ticketRef.current?.click()} className="mb-3 w-full rounded-xl border-2 border-dashed border-black/10 bg-cream py-10 text-center">
              {scanPhoto ? (
                <img src={scanPhoto.dataUrl} alt="Ticket" className="max-h-48 w-full object-contain" />
              ) : (
                <>
                  <div className="text-4xl">🧾</div>
                  <p className="mt-2 text-sm font-bold">Toca para fotografiar el ticket</p>
                </>
              )}
            </button>
            <input ref={ticketRef} type="file" accept="image/*"  className="hidden" onChange={onTicketPhoto} />
            <Btn disabled={!scanPhoto} onClick={scanTicket}>🤖 Extraer productos con IA</Btn>
            <Btn variant="ghost" onClick={() => setScanOpen(false)}>Cancelar</Btn>
          </>
        )}

        {scanStep === 2 && scanning && (
          <div className="py-10 text-center">
            <Spinner className="mx-auto" size="lg" />
            <p className="mt-3 font-bold text-muted">Claude está leyendo el ticket...</p>
          </div>
        )}

        {scanStep === 3 && (
          <>
            <Input label="Proveedor" value={extracted.proveedor} onChange={(e) => setExtracted({ ...extracted, proveedor: e.target.value })} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pb-2">Producto ticket</th>
                    <th className="pb-2">Asignar a</th>
                    <th className="pb-2">Costo</th>
                    <th className="pb-2">Uds</th>
                  </tr>
                </thead>
                <tbody>
                  {extracted.items.map((item, idx) => (
                    <tr key={idx} className="border-t border-black/5">
                      <td className="py-2 pr-1 font-bold">{item.nombre}</td>
                      <td className="py-2 pr-1">
                        <select
                          className="w-full rounded-lg bg-white p-1 text-[10px] font-bold"
                          value={item.producto_id}
                          onChange={(e) => {
                            const items = [...extracted.items];
                            items[idx] = { ...items[idx], producto_id: e.target.value };
                            setExtracted({ ...extracted, items });
                          }}
                        >
                          <option value="">—</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-1">
                        <input
                          type="number"
                          className="w-16 rounded-lg bg-white p-1 font-mono text-[10px]"
                          value={item.costo_total}
                          onChange={(e) => {
                            const items = [...extracted.items];
                            items[idx] = { ...items[idx], costo_total: e.target.value };
                            setExtracted({ ...extracted, items });
                          }}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          className="w-12 rounded-lg bg-white p-1 font-mono text-[10px]"
                          value={item.unidades}
                          onChange={(e) => {
                            const items = [...extracted.items];
                            items[idx] = { ...items[idx], unidades: e.target.value };
                            setExtracted({ ...extracted, items });
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Btn onClick={saveExtracted}>💾 Guardar todos los costos</Btn>
            <Btn variant="ghost" onClick={() => setScanStep(1)}>← Retomar foto</Btn>
          </>
        )}
      </CenterModal>
    </>
  );
}
