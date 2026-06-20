import { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const ProductsContext = createContext(null);

export function ProductsProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [topSellerIds, setTopSellerIds] = useState([]);
  const [cart, setCart] = useState({});
  const [selectedPay, setSelectedPay] = useState('plin');
  const [loading, setLoading] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('productos')
      .select('*, categorias(id, nombre, emoji)')
      .eq('activo', true)
      .order('nombre');

    if (!error) setProducts(data || []);
    setLoading(false);
    return data || [];
  }, []);

  const loadTopSellers = useCallback(async (limit = 8) => {
    const { data } = await supabase.from('venta_items').select('producto_id, cantidad');
    if (!data) { setTopSellerIds([]); return; }
    const totals = {};
    data.forEach((i) => { totals[i.producto_id] = (totals[i.producto_id] || 0) + i.cantidad; });
    const sorted = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => Number(id));
    setTopSellerIds(sorted);
  }, []);

  const addToCart = (id) => {
    const p = products.find((x) => x.id === id);
    if (!p || p.stock === 0) return { ok: false, msg: 'Sin stock' };
    const qty = cart[id] || 0;
    if (qty >= p.stock) return { ok: false, msg: 'No hay más stock' };
    setCart((c) => ({ ...c, [id]: qty + 1 }));
    return { ok: true };
  };

  const changeQty = (id, delta) => {
    const p = products.find((x) => x.id === id);
    setCart((c) => {
      const next = { ...c };
      const qty = (next[id] || 0) + delta;
      if (qty <= 0) delete next[id];
      else next[id] = p ? Math.min(qty, p.stock) : qty;
      return next;
    });
  };

  const clearCart = () => setCart({});

  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const p = products.find((x) => x.id === Number(id));
    return sum + (p ? p.precio * qty : 0);
  }, 0);

  const cartItems = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const p = products.find((x) => x.id === Number(id));
      return p ? { ...p, qty } : null;
    })
    .filter(Boolean);

  const registerSale = async (operatorId, extraData = {}) => {
    const items = cartItems.map((p) => ({
      producto_id: p.id,
      nombre_producto: p.nombre,
      precio_unitario: p.precio,
      cantidad: p.qty,
    }));

    const total = cartTotal;

    const { data: venta, error: ventaErr } = await supabase
      .from('ventas')
      .insert({
        usuario_id: operatorId,
        total,
        metodo_pago: selectedPay,
        ...extraData,
      })
      .select()
      .single();

    if (ventaErr) throw ventaErr;

    const { error: itemsErr } = await supabase.from('venta_items').insert(
      items.map((i) => ({ ...i, venta_id: venta.id }))
    );
    if (itemsErr) throw itemsErr;

    for (const item of items) {
      const p = products.find((x) => x.id === item.producto_id);
      if (p) {
        await supabase
          .from('productos')
          .update({ stock: p.stock - item.cantidad })
          .eq('id', item.producto_id);
      }
    }

    clearCart();
    await loadProducts();
    return venta;
  };

  return (
    <ProductsContext.Provider
      value={{
        products,
        topSellerIds,
        cart,
        cartItems,
        cartTotal,
        selectedPay,
        loading,
        setSelectedPay,
        loadProducts,
        loadTopSellers,
        addToCart,
        changeQty,
        clearCart,
        registerSale,
      }}
    >
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts debe usarse dentro de ProductsProvider');
  return ctx;
}
