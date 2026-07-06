import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useProducts } from '../hooks/useProducts';
import { useToast } from '../components/ui/Toast';
import { callClaude, parseClaudeJson, fileToBase64 } from '../lib/claude';
import { supabase, uploadImage, formatMoney } from '../lib/supabase';
import { BottomSheet, StepIndicator, Btn, Input, AiBadge } from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

// ── PAGO YAPE/PLIN ──────────────────────────────────────────
export function PagoPlinModal({ open, onClose, total, onSuccess }) {
  const { operator } = useAuth();
  const { registerSale } = useProducts();
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [photo, setPhoto] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [fields, setFields] = useState({ monto: '', operacion: '', fecha: '', pagador: '' });
  const [badges, setBadges] = useState({});
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const fileRef = useRef(null);

  const reset = () => { setStep(1); setPhoto(null); setFields({ monto: '', operacion: '', fecha: '', pagador: '' }); setBadges({}); setReceipt(null); };
  const handleClose = () => { reset(); onClose(); };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const d = await fileToBase64(file);
    setPhoto({ ...d, file });
  };

  const extract = async () => {
    if (!photo) return;
    setStep(2); setExtracting(true);
    const prompt = `Extrae datos de este voucher Yape o Plin peruano. Monto esperado: ${formatMoney(total)}.
Responde SOLO JSON sin backticks:
{"monto":"","numero_operacion":"","fecha_hora":"","nombre_pagador":"","monto_coincide":true,"confianza":{"monto":"alta","operacion":"alta","fecha":"alta"}}`;
    try {
      const raw = await callClaude(prompt, photo.base64, photo.mime);
      const data = parseClaudeJson(raw);
      setFields({ monto: data.monto || '', operacion: data.numero_operacion || '', fecha: data.fecha_hora || '', pagador: data.nombre_pagador || '' });
      setBadges(data.confianza || {});
    } catch {
      setFields((f) => ({ ...f, monto: total.toFixed(2) }));
      showToast('No se pudo leer el voucher, verifica manualmente', 'error');
    } finally { setExtracting(false); }
  };

  const confirm = async () => {
    if (!fields.operacion.trim()) { showToast('Ingresa el N° de operación', 'error'); return; }
    setSaving(true);
    try {
      let voucherUrl = null;
      if (photo?.file) voucherUrl = await uploadImage(photo.file, `voucher_${Date.now()}.jpg`, 'vouchers').catch(() => null);
      await registerSale(operator.id, { monto_yape: parseFloat(fields.monto) || total, numero_operacion: fields.operacion.trim(), fecha_hora: fields.fecha.trim(), nombre_pagador: fields.pagador.trim(), voucher_url: voucherUrl });
      setReceipt(fields); setStep(3);
      showToast('Pago confirmado', 'success');
    } catch { showToast('Error registrando venta', 'error'); } finally { setSaving(false); }
  };

  return (
    <BottomSheet open={open} onClose={handleClose} title="💚 Yape / Plin" subtitle="Solicita el pago y toma foto del voucher">
      <div className="rounded-2xl bg-white p-4 text-center mb-4">
        <div className="text-xs font-bold text-muted">Monto a cobrar</div>
        <div className="font-mono text-3xl font-bold text-bodega">{formatMoney(total)}</div>
      </div>
      <StepIndicator step={step} />
      {step === 1 && (
        <>
          <p className="mb-3 text-xs font-bold text-muted">Paso 1: Toma foto del voucher</p>
          <button type="button" onClick={() => fileRef.current?.click()} className={`mb-3 w-full overflow-hidden rounded-2xl border-2 border-dashed ${photo ? 'border-bodega' : 'border-black/10'}`}>
            {photo ? <img src={photo.dataUrl} alt="Voucher" className="max-h-52 w-full object-cover" /> : (
              <div className="py-10 text-center"><div className="text-4xl">📸</div><div className="mt-2 text-sm font-bold">Toca para tomar foto</div></div>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
          <Btn disabled={!photo} onClick={extract}>🤖 Leer voucher con IA</Btn>
          <Btn variant="ghost" onClick={handleClose}>Cancelar</Btn>
        </>
      )}
      {step === 2 && (
        extracting ? (
          <div className="py-8 text-center"><Spinner className="mx-auto" /><p className="mt-3 text-sm font-bold text-muted">Leyendo voucher...</p></div>
        ) : (
          <>
            <Input label="Monto pagado (S/)" badge={<AiBadge level={badges.monto} />} type="number" step="0.01" value={fields.monto} onChange={(e) => setFields({ ...fields, monto: e.target.value })} />
            <Input label="N° de operación" badge={<AiBadge level={badges.operacion} />} value={fields.operacion} onChange={(e) => setFields({ ...fields, operacion: e.target.value })} />
            <Input label="Fecha y hora" badge={<AiBadge level={badges.fecha} />} value={fields.fecha} onChange={(e) => setFields({ ...fields, fecha: e.target.value })} />
            <Input label="Nombre del pagador" value={fields.pagador} onChange={(e) => setFields({ ...fields, pagador: e.target.value })} />
            <Btn disabled={saving} onClick={confirm}>{saving ? 'Guardando...' : '✅ Confirmar pago'}</Btn>
            <Btn variant="ghost" onClick={() => setStep(1)}>← Retomar foto</Btn>
          </>
        )
      )}
      {step === 3 && receipt && (
        <>
          <div className="rounded-2xl bg-bodega/10 p-6 text-center">
            <div className="text-4xl">✅</div>
            <div className="mt-2 text-lg font-extrabold">¡Pago confirmado!</div>
            <div className="mt-4 space-y-2 text-left text-sm">
              {[['N° Operación', receipt.operacion], ['Fecha / Hora', receipt.fecha || '—'], ['Pagador', receipt.pagador || '—'], ['Monto', formatMoney(receipt.monto)], ['Total venta', formatMoney(total)]].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-2"><span className="font-bold text-muted">{l}</span><span className="font-extrabold">{v}</span></div>
              ))}
            </div>
          </div>
          <Btn onClick={() => { onSuccess?.(); handleClose(); }}>🎉 Listo, nueva venta</Btn>
        </>
      )}
    </BottomSheet>
  );
}

// ── PAGO EFECTIVO ────────────────────────────────────────────
export function PagoEfectivoModal({ open, onClose, total, onSuccess }) {
  const { operator } = useAuth();
  const { registerSale } = useProducts();
  const { showToast } = useToast();
  const [recibido, setRecibido] = useState('');
  const [selBill, setSelBill] = useState(null);
  const [saving, setSaving] = useState(false);

  const BILLETES = [500, 200, 100, 50, 20, 10, 5, 2, 1];
  const shown = BILLETES.filter((b) => b >= total).slice(0, 8);
  const rec = parseFloat(recibido) || 0;
  const vuelto = Math.round((rec - total) * 100) / 100;
  const canConfirm = rec >= total;

  const handleClose = () => { setRecibido(''); setSelBill(null); onClose(); };

  const confirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    try {
      await registerSale(operator.id, { monto_recibido: rec, vuelto: Math.max(0, vuelto) });
      showToast(`✅ Cobrado. ${vuelto > 0 ? `Vuelto: ${formatMoney(vuelto)}` : 'Pago exacto'}`, 'success');
      onSuccess?.(); handleClose();
    } catch { showToast('Error registrando venta', 'error'); } finally { setSaving(false); }
  };

  return (
    <BottomSheet open={open} onClose={handleClose} title="💵 Cobro en efectivo" subtitle="¿Cuánto te dio el cliente?">
      <div className="rounded-2xl bg-white p-4 text-center mb-4">
        <div className="text-xs font-bold text-muted">Total a cobrar</div>
        <div className="font-mono text-3xl font-bold text-bodega">{formatMoney(total)}</div>
      </div>
      <p className="mb-2 text-xs font-extrabold text-muted">Selecciona el billete recibido</p>
      <div className="mb-3 grid grid-cols-4 gap-2">
        {shown.map((b) => (
          <button key={b} onClick={() => { setRecibido(String(b)); setSelBill(b); }}
            className={`rounded-xl py-3 text-sm font-extrabold ${selBill === b ? 'bg-bodega text-white' : 'bg-white text-ink'}`}>
            S/{b}
          </button>
        ))}
      </div>
      <Input label="O ingresa el monto recibido (S/)" type="number" step="0.5" min="0" value={recibido} onChange={(e) => { setRecibido(e.target.value); setSelBill(null); }} />
      {canConfirm && vuelto >= 0.01 && (
        <div className="rounded-2xl bg-yellow/15 p-4 text-center mb-3">
          <div className="text-xs font-bold text-muted">Vuelto a dar</div>
          <div className="font-mono text-3xl font-bold text-yellow">{formatMoney(vuelto)}</div>
        </div>
      )}
      {rec > 0 && !canConfirm && <p className="mb-3 text-center text-sm font-bold text-red">⚠️ El monto es menor al total</p>}
      <Btn disabled={!canConfirm || saving} onClick={confirm}>{saving ? 'Guardando...' : '✅ Confirmar cobro'}</Btn>
      <Btn variant="ghost" onClick={handleClose}>Cancelar</Btn>
    </BottomSheet>
  );
}

// ── PAGO FIADO ───────────────────────────────────────────────
export function PagoFiadoModal({ open, onClose, total, onSuccess }) {
  const { operator } = useAuth();
  const { registerSale } = useProducts();
  const { showToast } = useToast();
  const [clientes, setClientes] = useState([]);
  const [search, setSearch] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from('clientes').select('id, nombre, telefono').eq('activo', true).order('nombre').then(({ data }) => setClientes(data || []));
  }, [open]);

  const filtered = clientes.filter((c) => c.nombre.toLowerCase().includes(search.toLowerCase()));

  const handleClose = () => { setSearch(''); setClienteId(''); setNewName(''); setNewPhone(''); setCreatingNew(false); onClose(); };

  const confirm = async () => {
    if (!clienteId && !newName.trim()) { showToast('Selecciona o crea un cliente', 'error'); return; }
    setSaving(true);
    try {
      let finalClienteId = clienteId;
      if (!clienteId && newName.trim()) {
        const { data } = await supabase.from('clientes').insert({ nombre: newName.trim(), telefono: newPhone.trim() || null }).select().single();
        finalClienteId = data.id;
      }
      await registerSale(operator.id, { cliente_id: parseInt(finalClienteId), estado: 'pendiente' });
      showToast(`📒 Fiado registrado a ${clientes.find((c) => c.id == finalClienteId)?.nombre || newName}`, 'success');
      onSuccess?.(); handleClose();
    } catch { showToast('Error registrando fiado', 'error'); } finally { setSaving(false); }
  };

  return (
    <BottomSheet open={open} onClose={handleClose} title="📒 Fiado" subtitle="Anotar venta pendiente de pago">
      <div className="rounded-2xl bg-red/10 p-4 text-center mb-4">
        <div className="text-xs font-bold text-red">Monto a fiar</div>
        <div className="font-mono text-3xl font-bold text-red">{formatMoney(total)}</div>
      </div>

      {!creatingNew ? (
        <>
          <Input label="Buscar cliente" placeholder="Escribe el nombre..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="mb-3 max-h-48 overflow-y-auto rounded-xl bg-white">
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-xs font-bold text-muted">No encontrado</p>
            ) : (
              filtered.map((c) => (
                <button key={c.id} onClick={() => setClienteId(String(c.id))}
                  className={`w-full px-4 py-3 text-left text-sm font-bold border-b border-black/5 last:border-0 transition ${clienteId == c.id ? 'bg-bodega/10 text-bodega' : 'text-ink'}`}>
                  {c.nombre} {c.telefono && <span className="text-muted font-normal">· {c.telefono}</span>}
                </button>
              ))
            )}
          </div>
          <Btn variant="ghost" onClick={() => setCreatingNew(true)}>+ Nuevo cliente</Btn>
        </>
      ) : (
        <>
          <Input label="Nombre del cliente" placeholder="Ej: María García" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input label="Teléfono (opcional)" placeholder="999 999 999" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <Btn variant="ghost" onClick={() => setCreatingNew(false)}>← Buscar existente</Btn>
        </>
      )}

      <Btn disabled={saving || (!clienteId && !newName.trim())} onClick={confirm}>
        {saving ? 'Guardando...' : '📒 Confirmar fiado'}
      </Btn>
      <Btn variant="ghost" onClick={handleClose}>Cancelar</Btn>
    </BottomSheet>
  );
}