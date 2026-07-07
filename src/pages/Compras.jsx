import { useEffect, useState, useRef } from 'react';
import { supabase, formatMoney, formatDateTime } from '../lib/supabase';
import { callClaude, parseClaudeJson, fileToBase64 } from '../lib/claude';
import { useToast } from '../components/ui/Toast';
import { Card, CenterModal, Btn, Input, Select } from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

export default function Compras() {
  const { showToast } = useToast();
  const [loading, setLoading]     = useState(true);
  const [compras, setCompras]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts]   = useState([]);
  const [selected, setSelected]   = useState(null); // compra seleccionada para ver detalle
  const [detalles, setDetalles]   = useState([]);   // items de esa compra

  // Modal nueva compra manual
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ proveedor: '', fecha_compra: today(), notas: '' });
  const [manualItems, setManualItems] = useState([newItem()]);

  // Modal scan ticket
  const [scanOpen, setScanOpen]   = useState(false);
  const [scanStep, setScanStep]   = useState(1);
  const [scanPhoto, setScanPhoto] = useState(null);
  const [scanning, setScanning]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [extracted, setExtracted] = useState({ proveedor: '', fecha_compra: today(), items: [] });
  const ticketRef = useRef(null);

  // Modal editar item
  const [editOpen, setEditOpen]   = useState(false);
  const [editItem, setEditItem]   = useState(null);

  function today() { return new Date().toISOString().split('T')[0]; }
  function newItem(defaultCatId = '') {
    return { nombre: '', categoria_id: defaultCatId, paquetes: '1', unidades_por_paquete: '1', costo_total: '', precio_venta: '', esProductoExistente: false, producto_id: '' };
  }

  const load = async () => {
    setLoading(true);
    const [{ data: comp }, { data: cats }, { data: prods }] = await Promise.all([
      supabase.from('compras').select('*').order('created_at', { ascending: false }),
      supabase.from('categorias').select('*').order('nombre'),
      supabase.from('productos').select('id, nombre, precio').eq('activo', true).order('nombre'),
    ]);
    setCompras(comp || []);
    setCategories(cats || []);
    setProducts(prods || []);
    setLoading(false);
  };

  const loadDetalle = async (compra) => {
    setSelected(compra);
    const { data } = await supabase
      .from('costos')
      .select('*, productos(nombre, precio, stock)')
      .eq('compra_id', compra.id)
      .order('id');
    setDetalles(data || []);
  };

  useEffect(() => { load(); }, []);

  // ── SCAN TICKET ─────────────────────────────────────────────
  const onTicketPhoto = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const data = await fileToBase64(file);
    setScanPhoto(data);
  };

  const scanTicket = async () => {
    if (!scanPhoto) return;
    setScanStep(2); setScanning(true);
    const defaultCatId = categories[0]?.id || '';
    const prompt = `Analiza este ticket de compra de bodega/tienda peruana.
Extrae: nombre del proveedor, fecha de compra (formato YYYY-MM-DD) y lista de productos.
Para cada producto extrae: nombre, cantidad de paquetes comprados, unidades por paquete, costo total pagado.
Responde SOLO JSON sin backticks:
{"proveedor":"","fecha_compra":"","items":[{"nombre":"","paquetes":1,"unidades_por_paquete":1,"costo_total":0}]}`;
    try {
      const raw  = await callClaude(prompt, scanPhoto.base64, scanPhoto.mime);
      const data = parseClaudeJson(raw);
      setExtracted({
        proveedor: data.proveedor || '',
        fecha_compra: data.fecha_compra || today(),
        items: (data.items || []).map((i) => {
          const paq  = parseInt(i.paquetes) || 1;
          const upaq = parseInt(i.unidades_por_paquete) || 1;
          const ct   = parseFloat(i.costo_total) || 0;
          const cu   = ct / (paq * upaq);
          const pvSug = Math.ceil(cu * 1.4 * 10) / 10;
          return { nombre: i.nombre || '', categoria_id: defaultCatId, paquetes: String(paq), unidades_por_paquete: String(upaq), costo_total: String(ct), precio_venta: pvSug.toFixed(2), esProductoExistente: false, producto_id: '' };
        }),
      });
      setScanStep(3);
    } catch (err) {
      showToast(err.message || 'No se pudo leer el ticket', 'error');
      setScanStep(1);
    } finally { setScanning(false); }
  };

  // ── GUARDAR (scan o manual) ──────────────────────────────────
  const guardarCompra = async (proveedor, fecha, items) => {
    const validos = items.filter((i) => (i.nombre?.trim() || i.producto_id) && parseFloat(i.costo_total) > 0);
    if (!proveedor.trim() || !validos.length) { showToast('Completa proveedor y al menos un producto', 'error'); return; }
    setSaving(true);
    try {
      // 1. Crear cabecera de compra
      const totalPagado = validos.reduce((s, i) => s + parseFloat(i.costo_total), 0);
      const { data: compra } = await supabase.from('compras').insert({ proveedor: proveedor.trim(), total_pagado: totalPagado, fecha_compra: fecha }).select().single();

      // 2. Por cada item crear/actualizar producto y registrar costo
      for (const item of validos) {
        const paq    = parseInt(item.paquetes) || 1;
        const upaq   = parseInt(item.unidades_por_paquete) || 1;
        const total  = parseFloat(item.costo_total);
        const totalU = paq * upaq;
        const cu     = total / totalU;
        const pv     = parseFloat(item.precio_venta) || cu * 1.4;

        let prodId = item.producto_id ? parseInt(item.producto_id) : null;

        if (!prodId) {
          // Crear producto nuevo
          const { data: prod } = await supabase.from('productos').insert({
            nombre: item.nombre.trim(),
            categoria_id: parseInt(item.categoria_id),
            precio: pv,
            stock: totalU,
            activo: true,
          }).select().single();
          prodId = prod.id;
        } else {
          // Sumar stock al producto existente
          const prod = products.find((p) => p.id === prodId);
          if (prod) await supabase.from('productos').update({ stock: (prod.stock || 0) + totalU }).eq('id', prodId);
        }

        // Registrar costo
        await supabase.from('costos').insert({
          producto_id: prodId,
          compra_id: compra.id,
          proveedor: proveedor.trim(),
          costo_total: total,
          paquetes: paq,
          unidades_por_paquete: upaq,
          total_unidades: totalU,
          unidades: totalU,
          costo_unitario: cu,
          precio_venta: pv,
        });
      }

      showToast(`✅ ${validos.length} productos guardados`, 'success');
      setScanOpen(false); setManualOpen(false);
      setScanStep(1); setScanPhoto(null);
      setManualItems([newItem()]);
      await load();
    } catch (e) {
      showToast(e.message || 'Error guardando compra', 'error');
    } finally { setSaving(false); }
  };

  // ── EDITAR ITEM DE COMPRA ────────────────────────────────────
  const openEdit = (item) => { setEditItem({ ...item }); setEditOpen(true); };

  const saveEdit = async () => {
    if (!editItem) return;
    const paq   = parseInt(editItem.paquetes) || 1;
    const upaq  = parseInt(editItem.unidades_por_paquete) || 1;
    const total = parseFloat(editItem.costo_total) || 0;
    const totalU = paq * upaq;
    const cu    = total / totalU;
    const pv    = parseFloat(editItem.precio_venta) || cu * 1.4;
    try {
      await supabase.from('costos').update({
        paquetes: paq, unidades_por_paquete: upaq,
        total_unidades: totalU, unidades: totalU,
        costo_total: total, costo_unitario: cu, precio_venta: pv,
      }).eq('id', editItem.id);
      await supabase.from('productos').update({ precio: pv }).eq('id', editItem.producto_id);
      showToast('✅ Actualizado', 'success');
      setEditOpen(false);
      await loadDetalle(selected);
    } catch { showToast('Error actualizando', 'error'); }
  };

  // ── HELPERS UI ───────────────────────────────────────────────
  const updateExtractedItem = (idx, field, value) => {
    const items = [...extracted.items];
    items[idx] = { ...items[idx], [field]: value };
    setExtracted({ ...extracted, items });
  };

  const updateManualItem = (idx, field, value) => {
    const items = [...manualItems];
    items[idx] = { ...items[idx], [field]: value };
    setManualItems(items);
  };

  const calcPreview = (item) => {
    const paq  = parseInt(item.paquetes) || 1;
    const upaq = parseInt(item.unidades_por_paquete) || 1;
    const ct   = parseFloat(item.costo_total) || 0;
    const cu   = ct / (paq * upaq);
    const pv   = parseFloat(item.precio_venta) || 0;
    const margen = pv > 0 ? ((pv - cu) / pv) * 100 : 0;
    return { cu, totalU: paq * upaq, margen };
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  // ── DETALLE DE COMPRA ────────────────────────────────────────
  if (selected) {
    return (
      <>
        <button onClick={() => setSelected(null)} className="mb-3 flex items-center gap-1 text-sm font-bold text-bodega">
          ← Volver
        </button>
        <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-lg font-extrabold">{selected.proveedor}</div>
          <div className="text-xs text-muted">{selected.fecha_compra} · {formatDateTime(selected.created_at)}</div>
          <div className="mt-2 font-mono text-xl font-bold text-bodega">{formatMoney(selected.total_pagado)}</div>
          {selected.notas && <div className="mt-1 text-xs text-muted">{selected.notas}</div>}
        </div>

        <Card title={`${detalles.length} productos en esta compra`}>
          {detalles.map((d) => {
            const pv = d.productos?.precio || d.precio_venta || 0;
            const cu = d.costo_unitario || 0;
            const margen = pv > 0 ? ((pv - cu) / pv) * 100 : 0;
            const mc = margen >= 30 ? 'text-bodega' : margen >= 15 ? 'text-yellow' : 'text-red';
            return (
              <div key={d.id} className="border-b border-black/5 py-3 last:border-0">
                <div className="flex justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-extrabold">{d.productos?.nombre || '—'}</div>
                    <div className="text-[10px] text-muted mt-0.5">
                      {d.paquetes || 1} paq × {d.unidades_por_paquete || 1} uds = {d.total_unidades || d.unidades} uds · Stock actual: {d.productos?.stock ?? '—'}
                    </div>
                    <div className="text-[10px] text-muted">
                      Costo/ud: {formatMoney(cu)} · Precio venta: {formatMoney(pv)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`font-mono text-sm font-extrabold ${mc}`}>{margen.toFixed(0)}%</span>
                    <button onClick={() => openEdit(d)} className="rounded-lg bg-cream px-2 py-1 text-xs">✏️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </Card>

        {/* Modal editar item */}
        <CenterModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar producto de compra">
          {editItem && (
            <>
              <div className="mb-3 rounded-xl bg-cream p-3 text-sm font-extrabold">{editItem.productos?.nombre}</div>
              <div className="grid grid-cols-2 gap-2">
                <Input label="Paquetes" type="number" min="1" value={editItem.paquetes || 1} onChange={(e) => setEditItem({ ...editItem, paquetes: e.target.value })} />
                <Input label="Uds/paquete" type="number" min="1" value={editItem.unidades_por_paquete || 1} onChange={(e) => setEditItem({ ...editItem, unidades_por_paquete: e.target.value })} />
              </div>
              <Input label="Costo total pagado (S/)" type="number" step="0.01" value={editItem.costo_total} onChange={(e) => setEditItem({ ...editItem, costo_total: e.target.value })} />
              <Input label="Precio de venta (S/)" type="number" step="0.10" value={editItem.precio_venta || editItem.productos?.precio || ''} onChange={(e) => setEditItem({ ...editItem, precio_venta: e.target.value })} />
              {/* Vista previa */}
              {(() => { const p = calcPreview(editItem); return (
                <div className="mb-3 rounded-xl bg-cream p-3 text-center text-xs grid grid-cols-3 gap-2">
                  <div><div className="text-muted font-bold">Costo/ud</div><div className="font-mono font-extrabold">{formatMoney(p.cu)}</div></div>
                  <div><div className="text-muted font-bold">Total uds</div><div className="font-mono font-extrabold">{p.totalU}</div></div>
                  <div><div className="text-muted font-bold">Margen</div><div className={`font-mono font-extrabold ${p.margen >= 30 ? 'text-bodega' : p.margen >= 15 ? 'text-yellow' : 'text-red'}`}>{p.margen.toFixed(0)}%</div></div>
                </div>
              ); })()}
              <Btn onClick={saveEdit}>✅ Guardar cambios</Btn>
              <Btn variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Btn>
            </>
          )}
        </CenterModal>
      </>
    );
  }

  // ── LISTA DE COMPRAS ─────────────────────────────────────────
  return (
    <>
      <div className="mb-3 flex gap-2">
        <Btn className="mt-0 flex-1" onClick={() => { setScanOpen(true); setScanStep(1); setScanPhoto(null); }}>
          📷 Escanear ticket
        </Btn>
        <Btn variant="ghost" className="mt-0 flex-1" onClick={() => {
          setManualForm({ proveedor: '', fecha_compra: today(), notas: '' });
          setManualItems([newItem(categories[0]?.id || '')]);
          setManualOpen(true);
        }}>
          + Manual
        </Btn>
      </div>

      <Card title="Historial de compras">
        {compras.length === 0 ? (
          <div className="py-10 text-center"><div className="text-3xl">🧾</div><p className="text-sm font-bold text-muted">Sin compras registradas</p></div>
        ) : (
          compras.map((c) => (
            <button key={c.id} onClick={() => loadDetalle(c)} className="w-full border-b border-black/5 py-3 last:border-0 text-left">
              <div className="flex justify-between gap-2">
                <div>
                  <div className="text-sm font-extrabold">{c.proveedor}</div>
                  <div className="text-[10px] text-muted">{c.fecha_compra}</div>
                </div>
                <div className="font-mono text-sm font-bold text-bodega shrink-0">{formatMoney(c.total_pagado)}</div>
              </div>
            </button>
          ))
        )}
      </Card>

      {/* ── MODAL SCAN ── */}
      <CenterModal open={scanOpen} onClose={() => setScanOpen(false)} title="📷 Escanear ticket">
        {scanStep === 1 && (
          <>
            <button type="button" onClick={() => ticketRef.current?.click()} className="mb-3 w-full rounded-xl border-2 border-dashed border-black/10 bg-cream py-10 text-center">
              {scanPhoto
                ? <img src={scanPhoto.dataUrl} alt="Ticket" className="max-h-48 w-full object-contain" />
                : <><div className="text-4xl">🧾</div><p className="mt-2 text-sm font-bold">Toca para fotografiar el ticket</p></>}
            </button>
            <input ref={ticketRef} type="file" accept="image/*" className="hidden" onChange={onTicketPhoto} />
            <Btn disabled={!scanPhoto} onClick={scanTicket}>🤖 Extraer con IA</Btn>
            <Btn variant="ghost" onClick={() => setScanOpen(false)}>Cancelar</Btn>
          </>
        )}

        {scanStep === 2 && (
          <div className="py-10 text-center"><Spinner className="mx-auto" size="lg" /><p className="mt-3 font-bold text-muted">Gemini está leyendo el ticket...</p></div>
        )}

        {scanStep === 3 && (
          <>
            <Input label="Proveedor" value={extracted.proveedor} onChange={(e) => setExtracted({ ...extracted, proveedor: e.target.value })} />
            <Input label="Fecha de compra" type="date" value={extracted.fecha_compra} onChange={(e) => setExtracted({ ...extracted, fecha_compra: e.target.value })} />
            <p className="mb-2 text-xs font-bold text-muted">Verifica y corrige — se crearán {extracted.items.length} productos nuevos</p>

            <div className="max-h-96 space-y-3 overflow-y-auto">
              {extracted.items.map((item, idx) => {
                const prev = calcPreview(item);
                return (
                  <div key={idx} className="rounded-xl bg-cream p-3">
                    <input className="mb-2 w-full rounded-lg bg-white p-2 text-sm font-extrabold" value={item.nombre} onChange={(e) => updateExtractedItem(idx, 'nombre', e.target.value)} placeholder="Nombre del producto" />
                    <select className="mb-2 w-full rounded-lg bg-white p-2 text-xs font-bold" value={item.categoria_id} onChange={(e) => updateExtractedItem(idx, 'categoria_id', e.target.value)}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nombre}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div><label className="text-[9px] font-bold text-muted">Paquetes</label><input type="number" className="w-full rounded-lg bg-white p-1.5 font-mono text-xs" value={item.paquetes} onChange={(e) => updateExtractedItem(idx, 'paquetes', e.target.value)} /></div>
                      <div><label className="text-[9px] font-bold text-muted">Uds/paquete</label><input type="number" className="w-full rounded-lg bg-white p-1.5 font-mono text-xs" value={item.unidades_por_paquete} onChange={(e) => updateExtractedItem(idx, 'unidades_por_paquete', e.target.value)} /></div>
                      <div><label className="text-[9px] font-bold text-muted">Costo total (S/)</label><input type="number" className="w-full rounded-lg bg-white p-1.5 font-mono text-xs" value={item.costo_total} onChange={(e) => updateExtractedItem(idx, 'costo_total', e.target.value)} /></div>
                      <div><label className="text-[9px] font-bold text-bodega">Precio venta (S/)</label><input type="number" className="w-full rounded-lg bg-white p-1.5 font-mono text-xs font-bold text-bodega" value={item.precio_venta} onChange={(e) => updateExtractedItem(idx, 'precio_venta', e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center text-[9px]">
                      <div className="rounded bg-white p-1"><div className="text-muted">Total uds</div><div className="font-mono font-bold">{prev.totalU}</div></div>
                      <div className="rounded bg-white p-1"><div className="text-muted">Costo/ud</div><div className="font-mono font-bold">{formatMoney(prev.cu)}</div></div>
                      <div className="rounded bg-white p-1"><div className="text-muted">Margen</div><div className={`font-mono font-bold ${prev.margen >= 30 ? 'text-bodega' : prev.margen >= 15 ? 'text-yellow' : 'text-red'}`}>{prev.margen.toFixed(0)}%</div></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Btn disabled={saving} onClick={() => guardarCompra(extracted.proveedor, extracted.fecha_compra, extracted.items)}>
              {saving ? 'Guardando...' : `💾 Crear ${extracted.items.length} productos`}
            </Btn>
            <Btn variant="ghost" onClick={() => setScanStep(1)}>← Retomar foto</Btn>
          </>
        )}
      </CenterModal>

      {/* ── MODAL MANUAL ── */}
      <CenterModal open={manualOpen} onClose={() => setManualOpen(false)} title="+ Agregar compra manual">
        <Input label="Proveedor" value={manualForm.proveedor} onChange={(e) => setManualForm({ ...manualForm, proveedor: e.target.value })} placeholder="Ej: Makro, Distribuidora Sol" />
        <Input label="Fecha de compra" type="date" value={manualForm.fecha_compra} onChange={(e) => setManualForm({ ...manualForm, fecha_compra: e.target.value })} />
        <Input label="Notas (opcional)" value={manualForm.notas} onChange={(e) => setManualForm({ ...manualForm, notas: e.target.value })} placeholder="Ej: Compra semanal" />

        <p className="mb-2 text-xs font-extrabold uppercase text-muted">Productos</p>
        <div className="max-h-80 space-y-3 overflow-y-auto">
          {manualItems.map((item, idx) => {
            const prev = calcPreview(item);
            return (
              <div key={idx} className="rounded-xl bg-cream p-3">
                <input className="mb-2 w-full rounded-lg bg-white p-2 text-sm font-extrabold" value={item.nombre} onChange={(e) => updateManualItem(idx, 'nombre', e.target.value)} placeholder="Nombre del producto" />
                <select className="mb-2 w-full rounded-lg bg-white p-2 text-xs font-bold" value={item.categoria_id} onChange={(e) => updateManualItem(idx, 'categoria_id', e.target.value)}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nombre}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div><label className="text-[9px] font-bold text-muted">Paquetes</label><input type="number" className="w-full rounded-lg bg-white p-1.5 font-mono text-xs" value={item.paquetes} onChange={(e) => updateManualItem(idx, 'paquetes', e.target.value)} /></div>
                  <div><label className="text-[9px] font-bold text-muted">Uds/paquete</label><input type="number" className="w-full rounded-lg bg-white p-1.5 font-mono text-xs" value={item.unidades_por_paquete} onChange={(e) => updateManualItem(idx, 'unidades_por_paquete', e.target.value)} /></div>
                  <div><label className="text-[9px] font-bold text-muted">Costo total (S/)</label><input type="number" className="w-full rounded-lg bg-white p-1.5 font-mono text-xs" value={item.costo_total} onChange={(e) => updateManualItem(idx, 'costo_total', e.target.value)} /></div>
                  <div><label className="text-[9px] font-bold text-bodega">Precio venta (S/)</label><input type="number" className="w-full rounded-lg bg-white p-1.5 font-mono text-xs font-bold text-bodega" value={item.precio_venta} onChange={(e) => updateManualItem(idx, 'precio_venta', e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-3 gap-1 text-center text-[9px]">
                  <div className="rounded bg-white p-1"><div className="text-muted">Total uds</div><div className="font-mono font-bold">{prev.totalU}</div></div>
                  <div className="rounded bg-white p-1"><div className="text-muted">Costo/ud</div><div className="font-mono font-bold">{formatMoney(prev.cu)}</div></div>
                  <div className="rounded bg-white p-1"><div className="text-muted">Margen</div><div className={`font-mono font-bold ${prev.margen >= 30 ? 'text-bodega' : prev.margen >= 15 ? 'text-yellow' : 'text-red'}`}>{prev.margen.toFixed(0)}%</div></div>
                </div>
                {manualItems.length > 1 && (
                  <button onClick={() => setManualItems(manualItems.filter((_, i) => i !== idx))} className="mt-2 text-[10px] font-bold text-red">🗑️ Quitar</button>
                )}
              </div>
            );
          })}
        </div>

        <Btn variant="ghost" onClick={() => setManualItems([...manualItems, newItem(categories[0]?.id || '')])} className="mt-2">
          + Agregar otro producto
        </Btn>
        <Btn disabled={saving} onClick={() => guardarCompra(manualForm.proveedor, manualForm.fecha_compra, manualItems)}>
          {saving ? 'Guardando...' : '💾 Guardar compra'}
        </Btn>
        <Btn variant="ghost" onClick={() => setManualOpen(false)}>Cancelar</Btn>
      </CenterModal>
    </>
  );
}