import { useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useProducts } from '../hooks/useProducts';
import { useToast } from '../components/ui/Toast';
import { callClaude, parseClaudeJson, fileToBase64 } from '../lib/claude';
import { uploadImage, formatMoney } from '../lib/supabase';
import {
  BottomSheet, StepIndicator, Btn, Input, AiBadge,
} from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

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

  const reset = () => {
    setStep(1);
    setPhoto(null);
    setFields({ monto: '', operacion: '', fecha: '', pagador: '' });
    setBadges({});
    setReceipt(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { base64, dataUrl, mime } = await fileToBase64(file);
    setPhoto({ base64, dataUrl, mime, file });
  };

  const extract = async () => {
    if (!photo) return;
    setStep(2);
    setExtracting(true);
    const prompt = `Eres un asistente que extrae datos de vouchers de Yape o Plin peruanos.
Analiza esta imagen y extrae:
1. monto: monto pagado en soles (número decimal)
2. numero_operacion: código de operación
3. fecha_hora: fecha y hora en formato DD/MM/YYYY HH:MM
4. nombre_pagador: nombre de quien pagó

El monto esperado es ${formatMoney(total)}.

Responde ÚNICAMENTE con JSON válido sin backticks:
{"monto":"","numero_operacion":"","fecha_hora":"","nombre_pagador":"","monto_coincide":true,"confianza":{"monto":"alta","operacion":"alta","fecha":"alta"}}`;

    try {
      const raw = await callClaude(prompt, photo.base64, photo.mime);
      const data = parseClaudeJson(raw);
      setFields({
        monto: data.monto || '',
        operacion: data.numero_operacion || '',
        fecha: data.fecha_hora || '',
        pagador: data.nombre_pagador || '',
      });
      setBadges(data.confianza || {});
    } catch {
      setFields((f) => ({ ...f, monto: total.toFixed(2) }));
      setBadges({});
      showToast('No se pudo leer el voucher, verifica manualmente', 'error');
    } finally {
      setExtracting(false);
    }
  };

  const confirm = async () => {
    if (!fields.operacion.trim()) {
      showToast('Ingresa el N° de operación', 'error');
      return;
    }
    setSaving(true);
    try {
      let voucherUrl = null;
      if (photo?.file) {
        const fname = `voucher_${Date.now()}.jpg`;
        voucherUrl = await uploadImage(photo.file, fname, 'vouchers').catch(() => null);
      }
      await registerSale(operator.id, {
        monto_yape: parseFloat(fields.monto) || total,
        numero_operacion: fields.operacion.trim(),
        fecha_hora: fields.fecha.trim(),
        nombre_pagador: fields.pagador.trim(),
        voucher_url: voucherUrl,
      });
      setReceipt(fields);
      setStep(3);
      showToast('Pago confirmado', 'success');
    } catch {
      showToast('Error registrando venta', 'error');
    } finally {
      setSaving(false);
    }
  };

  const finish = () => {
    onSuccess?.();
    handleClose();
  };

  return (
    <BottomSheet open={open} onClose={handleClose} title="💚 Yape / Plin" subtitle="Solicita el pago y toma foto del voucher">
      <div className="rounded-2xl bg-white p-4 text-center">
        <div className="text-xs font-bold text-muted">Monto a cobrar</div>
        <div className="font-mono text-3xl font-bold text-bodega">{formatMoney(total)}</div>
      </div>

      <StepIndicator step={step} />

      {step === 1 && (
        <>
          <p className="mb-3 text-xs font-bold text-muted">Paso 1: Toma foto del voucher</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`mb-3 w-full overflow-hidden rounded-2xl border-2 border-dashed ${
              photo ? 'border-bodega' : 'border-black/10'
            }`}
          >
            {photo ? (
              <img src={photo.dataUrl} alt="Voucher" className="max-h-52 w-full object-cover" />
            ) : (
              <div className="py-10 text-center">
                <div className="text-4xl">📸</div>
                <div className="mt-2 text-sm font-bold">Toca para tomar foto</div>
              </div>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
          <Btn disabled={!photo} onClick={extract}>🤖 Leer voucher con IA</Btn>
          <Btn variant="ghost" onClick={handleClose}>Cancelar</Btn>
        </>
      )}

      {step === 2 && (
        <>
          {extracting ? (
            <div className="py-8 text-center">
              <Spinner className="mx-auto" />
              <p className="mt-3 text-sm font-bold text-muted">Claude está leyendo el voucher...</p>
            </div>
          ) : (
            <>
              <Input
                label="Monto pagado (S/)"
                badge={<AiBadge level={badges.monto} />}
                type="number"
                step="0.01"
                value={fields.monto}
                onChange={(e) => setFields({ ...fields, monto: e.target.value })}
              />
              <Input
                label="N° de operación"
                badge={<AiBadge level={badges.operacion} />}
                value={fields.operacion}
                onChange={(e) => setFields({ ...fields, operacion: e.target.value })}
              />
              <Input
                label="Fecha y hora"
                badge={<AiBadge level={badges.fecha} />}
                value={fields.fecha}
                onChange={(e) => setFields({ ...fields, fecha: e.target.value })}
              />
              <Input
                label="Nombre del pagador"
                value={fields.pagador}
                onChange={(e) => setFields({ ...fields, pagador: e.target.value })}
              />
              <Btn disabled={saving} onClick={confirm}>
                {saving ? 'Guardando...' : '✅ Confirmar pago'}
              </Btn>
              <Btn variant="ghost" onClick={() => setStep(1)}>← Retomar foto</Btn>
            </>
          )}
        </>
      )}

      {step === 3 && receipt && (
        <>
          <div className="rounded-2xl bg-bodega/10 p-6 text-center">
            <div className="text-4xl">✅</div>
            <div className="mt-2 text-lg font-extrabold">¡Pago confirmado!</div>
            <div className="mt-4 space-y-2 text-left text-sm">
              <Row label="N° Operación" value={receipt.operacion} />
              <Row label="Fecha / Hora" value={receipt.fecha || '—'} />
              <Row label="Pagador" value={receipt.pagador || '—'} />
              <Row label="Monto pagado" value={formatMoney(receipt.monto)} mono />
              <Row label="Total venta" value={formatMoney(total)} mono />
            </div>
          </div>
          <Btn onClick={finish}>🎉 Listo, nueva venta</Btn>
        </>
      )}
    </BottomSheet>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="font-bold text-muted">{label}</span>
      <span className={`font-extrabold ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

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
  const insufficient = rec > 0 && vuelto < -0.001;
  const canConfirm = rec >= total;

  const handleClose = () => { setRecibido(''); setSelBill(null); onClose(); };

  const confirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    try {
      await registerSale(operator.id, {
        monto_recibido: rec,
        vuelto: Math.max(0, vuelto),
      });
      showToast(`✅ Venta: ${formatMoney(total)}`, 'success');
      onSuccess?.();
      handleClose();
    } catch {
      showToast('Error registrando venta', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={handleClose} title="💵 Cobro en efectivo" subtitle="¿Cuánto te dio el cliente?">
      <div className="rounded-2xl bg-white p-4 text-center">
        <div className="text-xs font-bold text-muted">Total a cobrar</div>
        <div className="font-mono text-3xl font-bold text-bodega">{formatMoney(total)}</div>
      </div>

      <p className="mb-2 mt-4 text-xs font-extrabold text-muted">Selecciona el billete recibido</p>
      <div className="mb-3 grid grid-cols-4 gap-2">
        {shown.map((b) => (
          <button
            key={b}
            onClick={() => { setRecibido(String(b)); setSelBill(b); }}
            className={`rounded-xl py-3 text-sm font-extrabold ${
              selBill === b ? 'bg-bodega text-white' : 'bg-white text-ink'
            }`}
          >
            S/{b}
          </button>
        ))}
      </div>

      <Input
        label="O ingresa el monto recibido (S/)"
        type="number"
        step="0.5"
        min="0"
        value={recibido}
        onChange={(e) => { setRecibido(e.target.value); setSelBill(null); }}
        className="text-center text-lg"
      />

      {canConfirm && vuelto >= 0.01 && (
        <div className="rounded-2xl bg-yellow/15 p-4 text-center">
          <div className="text-xs font-bold text-muted">Vuelto a dar</div>
          <div className="font-mono text-3xl font-bold text-yellow">{formatMoney(vuelto)}</div>
        </div>
      )}

      {insufficient && (
        <p className="text-center text-sm font-bold text-red">⚠️ El monto recibido es menor al total</p>
      )}

      <Btn disabled={!canConfirm || saving} onClick={confirm}>
        {saving ? 'Guardando...' : '✅ Confirmar cobro'}
      </Btn>
      <Btn variant="ghost" onClick={handleClose}>Cancelar</Btn>
    </BottomSheet>
  );
}
