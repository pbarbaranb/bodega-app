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
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState({ ganancia: 0, margen: 0 });
  const [loading, setLoading] = useState(true);

  const [manualOpen, setManualOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ producto_id: '', proveedor: '', costo_total: '', unidades: '1' });
  const [preview, setPreview] = useState(null);

  const [scanStep, setScanStep] = useState(1);
  const [scanPhoto, setScanPhoto] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState({ proveedor: '', items: [] });
  const ticketRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [{ data: costData }, { data: prods }, { data: cats }, { data: ventas }] = await Promise.all([
      supabase.from('costos').select('*, productos(nombre, precio)').order('created_at', { ascending: false }),
      supabase.from('productos').select('id, nombre, precio').eq('activo', true).order('nombre'),
      supabase.from('categorias').select('*').order('nombre'),
      supabase.from('ventas').select('total, created_at, venta_items(producto_id, cantidad, precio_unitario)').gte('created_at', `${today}T00:00:00`),
    ]);

    setCostos(costData || []);
    setProducts(prods || []);
    setCategories(cats || []);

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
      const data = parseClaudeJson(raw);
      const defaultCatId = categories[0]?.id || '';
      setExtracted({
        proveedor: data.proveedor || '',
        items: (data.items || []).map((i) => {
          const ct = i.costo_total || 0;
          const u = i.unidades || 1;
          const costoUd = ct / u;
          const precioSugerido = Math.ceil((costoUd * 1.4) * 10) / 10; // +40% redondeado a 0.10
          return {
            nombre: i.nombre || '',
            costo_total: ct,
            unidades: u,
            categoria_id: defaultCatId,
            precio_venta: precioSugerido.toFixed(2),
          };
        }),
      });
      setScanStep(3);
    } catch (err) {
      showToast(err.message || 'No se pudo leer el ticket', 'error');
      setScanStep(1);
    } finally {
      setScanning(false);
    }
  };

  const updateItem = (idx, field, value) => {
    const items = [...extracted.items];
    items[idx] = { ...items[idx], [field]: value };
    setExtracted({ ...extracted, items });
  };

  const saveExtracted = async () => {
    const valid = extracted.items.filter((i) => i.nombre.trim() && i.costo_total > 0 && i.categoria_id);
    if (!valid.length) {
      showToast('Completa nombre, categoría y costo de al menos un producto', 'error');
      return;
    }
    setSaving(true);
    try {
      let created = 0;
      for (const item of valid) {
        const unidades = parseInt(item.unidades) || 1;
        const costoTotal = parseFloat(item.costo_total);
        const costoUd = costoTotal / unidades;

        // 1. Crear el producto nuevo
        const { data: nuevoProducto, error: prodErr } = await supabase
          .from('productos')
          .insert({
            nombre: item.nombre.trim(),
            categoria_id: parseInt(item.categoria_id),
            precio: parseFloat(item.precio_venta) || costoUd * 1.4,
            stock: unidades,
            activo: true,
          })
          .select()
          .single();

        if (prodErr) continue;

        // 2. Registrar el costo vinculado a ese producto y al proveedor
        await supabase.from('costos').insert({
          producto_id: nuevoProducto.id,
          proveedor: extracted.proveedor.trim(),
          costo_total: costoTotal,
          unidades,
          costo_unitario: costoUd,
        });

        created++;
      }
      showToast(`${created} productos agregados con su costo`, 'success');
      setScanOpen(false);
      setScanStep(1);
      setScanPhoto(null);
      setExtracted({ proveedor: '', items: [] });
      load();
    } catch {
      showToast('Error guardando productos', 'error');
    } finally {
      setSaving(false);
    }
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
                    {c.proveedor && `${c.proveedor} · `}Costo/ud {formatMoney(costoUd)} · Venta {formatMoney(precio)}
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
            <input ref={ticketRef} type="file" accept="image/*" className="hidden" onChange={onTicketPhoto} />
            <Btn disabled={!scanPhoto} onClick={scanTicket}>🤖 Extraer productos con IA</Btn>
            <Btn variant="ghost" onClick={() => setScanOpen(false)}>Cancelar</Btn>
          </>
        )}

        {scanStep === 2 && scanning && (
          <div className="py-10 text-center">
            <Spinner className="mx-auto" size="lg" />
            <p className="mt-3 font-bold text-muted">Gemini está leyendo el ticket...</p>
          </div>
        )}

        {scanStep === 3 && (
          <>
            <p className="mb-2 text-xs font-bold text-muted">
              Se van a crear {extracted.items.length} productos nuevos. Verifica y corrige antes de guardar.
            </p>
            <Input label="Proveedor" value={extracted.proveedor} onChange={(e) => setExtracted({ ...extracted, proveedor: e.target.value })} />

            <div className="max-h-96 space-y-3 overflow-y-auto">
              {extracted.items.map((item, idx) => (
                <div key={idx} className="rounded-xl bg-cream p-3">
                  <input
                    className="mb-2 w-full rounded-lg bg-white p-2 text-sm font-extrabold"
                    value={item.nombre}
                    onChange={(e) => updateItem(idx, 'nombre', e.target.value)}
                    placeholder="Nombre del producto"
                  />
                  <select
                    className="mb-2 w-full rounded-lg bg-white p-2 text-xs font-bold"
                    value={item.categoria_id}
                    onChange={(e) => updateItem(idx, 'categoria_id', e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.emoji} {c.nombre}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-muted">Costo total</label>
                      <input
                        type="number"
                        className="w-full rounded-lg bg-white p-1.5 font-mono text-xs"
                        value={item.costo_total}
                        onChange={(e) => updateItem(idx, 'costo_total', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-muted">Unidades</label>
                      <input
                        type="number"
                        className="w-full rounded-lg bg-white p-1.5 font-mono text-xs"
                        value={item.unidades}
                        onChange={(e) => updateItem(idx, 'unidades', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-bodega">Precio venta</label>
                      <input
                        type="number"
                        className="w-full rounded-lg bg-white p-1.5 font-mono text-xs font-bold text-bodega"
                        value={item.precio_venta}
                        onChange={(e) => updateItem(idx, 'precio_venta', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Btn disabled={saving} onClick={saveExtracted}>
              {saving ? 'Guardando...' : `💾 Crear ${extracted.items.length} productos`}
            </Btn>
            <Btn variant="ghost" onClick={() => setScanStep(1)}>← Retomar foto</Btn>
          </>
        )}
      </CenterModal>
    </>
  );
}