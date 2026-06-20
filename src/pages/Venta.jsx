import { useEffect, useState } from 'react';
import { useProducts } from '../hooks/useProducts';
import { useToast } from '../components/ui/Toast';
import { formatMoney } from '../lib/supabase';
import { Card, Btn } from '../components/ui/Modal';
import { PagoPlinModal, PagoEfectivoModal } from '../components/PagoModals';
import Spinner from '../components/ui/Spinner';

function ProductCard({ p, qty, onAdd }) {
  const low = p.stock < 5;
  return (
    <button
      onClick={() => onAdd(p.id)}
      disabled={p.stock === 0}
      className={`relative overflow-hidden rounded-2xl bg-white text-left shadow-sm transition active:scale-[0.98] ${
        qty > 0 ? 'ring-2 ring-bodega' : ''
      } ${p.stock === 0 ? 'opacity-50' : ''}`}
    >
      {qty > 0 && (
        <span className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-bodega text-xs font-extrabold text-white">
          {qty}
        </span>
      )}
      <div className="flex h-24 items-center justify-center bg-cream text-4xl">
        {p.imagen_url ? (
          <img src={p.imagen_url} alt={p.nombre} className="h-full w-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
        ) : (
          p.categorias?.emoji || '📦'
        )}
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
    products, topSellerIds, cart, cartItems, cartTotal, selectedPay,
    loading, setSelectedPay, loadProducts, loadTopSellers, addToCart, changeQty, clearCart,
  } = useProducts();
  const { showToast } = useToast();
  const [plinOpen, setPlinOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);

  useEffect(() => {
    loadProducts();
    loadTopSellers();
  }, [loadProducts, loadTopSellers]);

  const handleAdd = (id) => {
    const r = addToCart(id);
    if (!r.ok) showToast(r.msg, 'error');
  };

  const finalize = () => {
    if (!cartItems.length) {
      showToast('El carrito está vacío', 'error');
      return;
    }
    if (selectedPay === 'plin') setPlinOpen(true);
    else setCashOpen(true);
  };

  if (loading && !products.length) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const topProducts = topSellerIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean);

  // Agrupar productos por categoría
  const groups = {};
  products.forEach((p) => {
    const key = p.categorias?.nombre || 'Sin categoría';
    const emoji = p.categorias?.emoji || '📦';
    if (!groups[key]) groups[key] = { emoji, items: [] };
    groups[key].items.push(p);
  });
  const groupNames = Object.keys(groups).sort();

  return (
    <>
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

      {products.length === 0 ? (
        <div className="py-16 text-center">
          <div className="text-4xl">📦</div>
          <p className="mt-2 text-sm font-bold text-muted">Sin productos</p>
        </div>
      ) : (
        groupNames.map((name) => (
          <div key={name} className="mb-5">
            <p className="mb-2 text-xs font-extrabold uppercase text-muted">
              {groups[name].emoji} {name}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {groups[name].items.map((p) => (
                <ProductCard key={p.id} p={p} qty={cart[p.id] || 0} onAdd={handleAdd} />
              ))}
            </div>
          </div>
        ))
      )}

      {cartItems.length > 0 && (
        <Card title="Carrito" className="mt-4">
          <div className="space-y-3">
            {cartItems.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold">{p.nombre}</div>
                  <div className="text-xs font-bold text-muted">{formatMoney(p.precio)} c/u</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => changeQty(p.id, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-cream text-lg font-bold">−</button>
                  <span className="w-6 text-center font-extrabold">{p.qty}</span>
                  <button onClick={() => changeQty(p.id, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-cream text-lg font-bold">+</button>
                  <span className="font-mono text-sm font-bold text-bodega w-16 text-right">
                    {formatMoney(p.precio * p.qty)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4">
            <span className="text-sm font-extrabold">Total a cobrar</span>
            <span className="font-mono text-2xl font-bold text-bodega">{formatMoney(cartTotal)}</span>
          </div>

          <p className="mt-4 text-xs font-extrabold uppercase text-muted">Método de pago</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelectedPay('plin')}
              className={`rounded-xl py-3 text-xs font-extrabold ${
                selectedPay === 'plin' ? 'bg-bodega text-white' : 'bg-cream text-ink'
              }`}
            >
              💚 Yape / Plin
            </button>
            <button
              onClick={() => setSelectedPay('cash')}
              className={`rounded-xl py-3 text-xs font-extrabold ${
                selectedPay === 'cash' ? 'bg-bodega text-white' : 'bg-cream text-ink'
              }`}
            >
              💵 Efectivo
            </button>
          </div>

          <Btn onClick={finalize}>✅ Cobrar</Btn>
          <Btn variant="ghost" onClick={clearCart}>🗑️ Limpiar carrito</Btn>
        </Card>
      )}

      <PagoPlinModal open={plinOpen} onClose={() => setPlinOpen(false)} total={cartTotal} />
      <PagoEfectivoModal open={cashOpen} onClose={() => setCashOpen(false)} total={cartTotal} />
    </>
  );
}