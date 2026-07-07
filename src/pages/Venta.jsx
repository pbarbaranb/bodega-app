import { useEffect, useState } from 'react';
import { useProducts } from '../hooks/useProducts';
import { useToast } from '../components/ui/Toast';
import { formatMoney } from '../lib/supabase';
import { Card, Btn } from '../components/ui/Modal';
import { PagoPlinModal, PagoEfectivoModal, PagoFiadoModal } from '../components/PagoModals';
import Spinner from '../components/ui/Spinner';

function ProductCard({ p, qty, onAdd }) {
  const low = p.stock > 0 && p.stock < 5;
  return (
    <button onClick={() => onAdd(p.id)} disabled={p.stock === 0}
      className={`relative overflow-hidden rounded-2xl bg-white text-left shadow-sm transition active:scale-[0.98] ${qty > 0 ? 'ring-2 ring-bodega' : ''} ${p.stock === 0 ? 'opacity-50' : ''}`}>
      {qty > 0 && (
        <span className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-bodega text-xs font-extrabold text-white">{qty}</span>
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
  const { products, topSellerIds, cart, cartItems, cartTotal, selectedPay, loading, setSelectedPay, loadProducts, loadTopSellers, addToCart, changeQty, clearCart } = useProducts();
  const { showToast } = useToast();
  const [plinOpen, setPlinOpen]   = useState(false);
  const [cashOpen, setCashOpen]   = useState(false);
  const [fiadoOpen, setFiadoOpen] = useState(false);

  useEffect(() => { loadProducts(); loadTopSellers?.(); }, [loadProducts, loadTopSellers]);

  const handleAdd = (id) => { const r = addToCart(id); if (!r.ok) showToast(r.msg, 'error'); };

  const finalize = () => {
    if (!cartItems.length) { showToast('El carrito está vacío', 'error'); return; }
    if (selectedPay === 'plin')  setPlinOpen(true);
    else if (selectedPay === 'cash')  setCashOpen(true);
    else setFiadoOpen(true);
  };

  const onSuccess = () => { clearCart(); loadProducts(); };

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

      {/* Productos por categoría */}
      {products.length === 0 ? (
        <div className="py-16 text-center"><div className="text-4xl">📦</div><p className="mt-2 text-sm font-bold text-muted">Sin productos</p></div>
      ) : (
        Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([name, group]) => (
          <div key={name} className="mb-5">
            <p className="mb-2 text-xs font-extrabold uppercase text-muted">{group.emoji} {name}</p>
            <div className="grid grid-cols-2 gap-3">
              {group.items.map((p) => <ProductCard key={p.id} p={p} qty={cart[p.id] || 0} onAdd={handleAdd} />)}
            </div>
          </div>
        ))
      )}

      {/* Espacio para que el carrito sticky no tape productos */}
      {cartItems.length > 0 && <div className="h-48" />}

      {/* Carrito sticky en la parte inferior */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-[480px]">
          {/* Barra colapsada — siempre visible */}
          <CartBar
            cartItems={cartItems}
            cartTotal={cartTotal}
            selectedPay={selectedPay}
            setSelectedPay={setSelectedPay}
            changeQty={changeQty}
            clearCart={clearCart}
            finalize={finalize}
          />
        </div>
      )}

      <PagoPlinModal   open={plinOpen}  onClose={() => setPlinOpen(false)}  total={cartTotal} onSuccess={onSuccess} />
      <PagoEfectivoModal open={cashOpen} onClose={() => setCashOpen(false)} total={cartTotal} onSuccess={onSuccess} />
      <PagoFiadoModal  open={fiadoOpen} onClose={() => setFiadoOpen(false)} total={cartTotal} onSuccess={onSuccess} />
    </>
  );
}