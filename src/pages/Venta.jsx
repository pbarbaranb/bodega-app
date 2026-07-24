import { useEffect, useState } from 'react';
import { useProducts } from '../hooks/useProducts';
import { useToast } from '../components/ui/Toast';
import { formatMoney } from '../lib/supabase';
import { Btn } from '../components/ui/Modal';
import { PagoPlinModal, PagoEfectivoModal, PagoFiadoModal } from '../components/PagoModals';
import Spinner from '../components/ui/Spinner';

function ProductCard({ p, qty, onAdd }) {
  const low = p.stock > 0 && p.stock < 5;
  return (
    <button
      onClick={() => onAdd(p.id)}
      disabled={p.stock === 0}
      className={`relative overflow-hidden rounded-2xl bg-white text-left shadow-sm transition active:scale-[0.98] ${qty > 0 ? 'ring-2 ring-bodega' : ''} ${p.stock === 0 ? 'opacity-50' : ''}`}
    >
      {qty > 0 && (
        <span className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-bodega text-xs font-extrabold text-white">
          {qty}
        </span>
      )}
      <div className="flex h-24 items-center justify-center bg-cream text-4xl overflow-hidden">
        {p.imagen_url
          ? <img src={p.imagen_url} alt={p.nombre} className="h-full w-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
          : p.categorias?.emoji || '📦'}
      </div>
      <div className="p-2.5">
        <div className="line-clamp-2 text-xs font-extrabold leading-tight">{p.nombre}</div>
        <div className="font-mono text-sm font-bold text-bodega">{formatMoney(p.precio)}</div>
        <div className={`text-[10px] font-bold ${p.stock === 0 ? 'text-red' : low ? 'text-yellow' : 'text-muted'}`}>
          {p.stock === 0 ? '❌ Sin stock' : low ? `⚠️ ${p.stock} uds` : `${p.stock} uds`}
        </div>
      </div>
    </button>
  );
}

export default function Venta() {
  const {
    products, topSellerIds, cart, cartItems, cartTotal,
    selectedPay, loading, setSelectedPay,
    loadProducts, loadTopSellers, addToCart, changeQty, clearCart,
  } = useProducts();
  const { showToast } = useToast();

  const [cartExpanded, setCartExpanded] = useState(false);
  const [plinOpen,  setPlinOpen]  = useState(false);
  const [cashOpen,  setCashOpen]  = useState(false);
  const [fiadoOpen, setFiadoOpen] = useState(false);

  useEffect(() => {
    loadProducts();
    loadTopSellers?.();
  }, [loadProducts, loadTopSellers]);

  // Cuando se agrega el primer producto, expandir el carrito
  useEffect(() => {
    if (cartItems.length > 0) setCartExpanded(true);
    if (cartItems.length === 0) setCartExpanded(false);
  }, [cartItems.length]);

  const handleAdd = (id) => {
    const r = addToCart(id);
    if (!r.ok) showToast(r.msg, 'error');
  };

  const finalize = () => {
    if (!cartItems.length) { showToast('El carrito está vacío', 'error'); return; }
    if (selectedPay === 'plin')  setPlinOpen(true);
    else if (selectedPay === 'cash') setCashOpen(true);
    else setFiadoOpen(true);
  };

  const onSuccess = () => { clearCart(); loadProducts(); setCartExpanded(false); };

  if (loading && !products.length) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  const topProducts = (topSellerIds || []).map((id) => products.find((p) => p.id === id)).filter(Boolean);
  const groups = {};
  products.forEach((p) => {
    const key = p.categorias?.nombre || 'Sin categoría';
    if (!groups[key]) groups[key] = { emoji: p.categorias?.emoji || '📦', items: [] };
    groups[key].items.push(p);
  });

  return (
    <>
      {/* ── PRODUCTOS ── */}
      <div className={cartItems.length > 0 ? 'pb-44' : ''}>

        {/* Más vendidos */}
        {topProducts.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-extrabold uppercase text-muted">⭐ Más vendidos</p>
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {topProducts.map((p) => (
                <div key={p.id} className="w-28 shrink-0">
                  <ProductCard p={p} qty={cart[p.id] || 0} onAdd={handleAdd} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Por categoría */}
        {products.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl">📦</div>
            <p className="mt-2 text-sm font-bold text-muted">Sin productos</p>
          </div>
        ) : (
          Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([name, group]) => (
            <div key={name} className="mb-5">
              <p className="mb-2 text-xs font-extrabold uppercase text-muted">{group.emoji} {name}</p>
              <div className="grid grid-cols-2 gap-3">
                {group.items.map((p) => (
                  <ProductCard key={p.id} p={p} qty={cart[p.id] || 0} onAdd={handleAdd} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── CARRITO STICKY BOTTOM ── */}
      {cartItems.length > 0 && (
        <div style={{position:'fixed', bottom:0, left:0, right:0, zIndex:50}}>
          <div className="bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.12)] rounded-t-3xl overflow-hidden">

            {/* Barra superior — siempre visible, toca para expandir/colapsar */}
            <button
              onClick={() => setCartExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bodega text-xs font-extrabold text-white">
                  {cartItems.reduce((s, i) => s + i.qty, 0)}
                </span>
                <span className="text-sm font-extrabold">
                  {cartItems.length === 1 ? cartItems[0].nombre : `${cartItems.length} productos`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg font-extrabold text-bodega">{formatMoney(cartTotal)}</span>
                <span className="text-muted text-sm">{cartExpanded ? '▼' : '▲'}</span>
              </div>
            </button>

            {/* Detalle expandido */}
            {cartExpanded && (
              <div className="px-4 pb-4 border-t border-black/5">

                {/* Items */}
                <div className="max-h-48 overflow-y-auto py-2 space-y-2">
                  {cartItems.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-extrabold">{p.nombre}</div>
                        <div className="text-[10px] font-bold text-muted">{formatMoney(p.precio)} c/u</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => changeQty(p.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-cream text-base font-bold">−</button>
                        <span className="w-5 text-center text-sm font-extrabold">{p.qty}</span>
                        <button onClick={() => changeQty(p.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-cream text-base font-bold">+</button>
                        <span className="font-mono text-xs font-bold text-bodega w-14 text-right">{formatMoney(p.precio * p.qty)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Método de pago */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { val: 'plin',  label: '💚 Yape',    active: 'bg-bodega text-white' },
                    { val: 'cash',  label: '💵 Efectivo', active: 'bg-bodega text-white' },
                    { val: 'fiado', label: '📒 Fiado',    active: 'bg-red text-white'   },
                  ].map(({ val, label, active }) => (
                    <button
                      key={val}
                      onClick={() => setSelectedPay(val)}
                      className={`rounded-xl py-2.5 text-xs font-extrabold transition ${selectedPay === val ? active : 'bg-cream text-ink'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Botones */}
                <div className="mt-3 flex gap-2">
                  <button onClick={clearCart} className="rounded-xl bg-cream px-4 py-3 text-xs font-extrabold text-muted">
                    🗑️
                  </button>
                  <button
                    onClick={finalize}
                    className="flex-1 rounded-xl bg-bodega py-3 text-sm font-extrabold text-white active:bg-bodega/80"
                  >
                    ✅ Cobrar {formatMoney(cartTotal)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <PagoPlinModal    open={plinOpen}  onClose={() => setPlinOpen(false)}  total={cartTotal} onSuccess={onSuccess} />
      <PagoEfectivoModal open={cashOpen} onClose={() => setCashOpen(false)} total={cartTotal} onSuccess={onSuccess} />
      <PagoFiadoModal   open={fiadoOpen} onClose={() => setFiadoOpen(false)} total={cartTotal} onSuccess={onSuccess} />
    </>
  );
}