import { useEffect, useState, useRef } from 'react';
import { supabase, uploadImage, formatMoney } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';
import { Card, CenterModal, Btn, Input, Select } from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

export default function Productos() {
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ nombre: '', categoria_id: '', precio: '', stock: '' });
  const [imgFile, setImgFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from('productos').select('*, categorias(nombre, emoji)').eq('activo', true).order('nombre'),
      supabase.from('categorias').select('*').order('nombre'),
    ]);
    setProducts(prods || []);
    setCategories(cats || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditId(null);
    setForm({ nombre: '', categoria_id: categories[0]?.id || '', precio: '', stock: '' });
    setImgFile(null);
    setPreview(null);
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditId(p.id);
    setForm({
      nombre: p.nombre,
      categoria_id: p.categoria_id || '',
      precio: p.precio,
      stock: p.stock,
    });
    setImgFile(null);
    setPreview(p.imagen_url || null);
    setModalOpen(true);
  };

  const onImg = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const save = async () => {
    const { nombre, categoria_id, precio, stock } = form;
    if (!nombre.trim() || precio === '' || stock === '') {
      showToast('Completa todos los campos', 'error');
      return;
    }
    try {
      const body = {
        nombre: nombre.trim(),
        categoria_id: parseInt(categoria_id),
        precio: parseFloat(precio),
        stock: parseInt(stock),
      };

      if (editId) {
        let imagen_url;
        if (imgFile) imagen_url = await uploadImage(imgFile, `${editId}.${imgFile.name.split('.').pop()}`);
        await supabase
          .from('productos')
          .update({ ...body, ...(imagen_url ? { imagen_url } : {}) })
          .eq('id', editId);
        showToast('Producto actualizado', 'success');
      } else {
        const { data } = await supabase.from('productos').insert(body).select().single();
        if (imgFile && data) {
          const url = await uploadImage(imgFile, `${data.id}.${imgFile.name.split('.').pop()}`);
          await supabase.from('productos').update({ imagen_url: url }).eq('id', data.id);
        }
        showToast('Producto agregado', 'success');
      }
      setModalOpen(false);
      load();
    } catch {
      showToast('Error guardando producto', 'error');
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este producto?')) return;
    await supabase.from('productos').update({ activo: false }).eq('id', id);
    showToast('Producto eliminado', 'success');
    load();
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  const grouped = Object.entries(
    products.reduce((acc, p) => {
      const key = p.categorias?.nombre || 'Sin categoría';
      const emoji = p.categorias?.emoji || '📦';
      if (!acc[key]) acc[key] = { emoji, items: [] };
      acc[key].items.push(p);
      return acc;
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <Btn onClick={openNew} className="mb-3 mt-0">+ Agregar producto</Btn>

      <Card>
        {products.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-3xl">📦</div>
            <p className="text-sm font-bold text-muted">Sin productos</p>
          </div>
        ) : (
          grouped.map(([catName, group]) => (
            <div key={catName} className="mb-2">
              <p className="mb-1 mt-3 text-xs font-extrabold uppercase text-muted first:mt-0">
                {group.emoji} {catName}
              </p>
              {group.items.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border-b border-black/5 py-3 last:border-0">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-cream text-2xl">
                    {p.imagen_url ? (
                      <img src={p.imagen_url} alt={p.nombre} className="h-full w-full object-cover" />
                    ) : (
                      p.categorias?.emoji || '📦'
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold">{p.nombre}</div>
                    <div className="text-[11px] font-bold text-muted">Stock: {p.stock}</div>
                    <div className="font-mono text-sm font-bold text-bodega">{formatMoney(p.precio)}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p)} className="rounded-lg bg-cream px-2 py-1 text-sm">✏️</button>
                    <button onClick={() => remove(p.id)} className="rounded-lg bg-red/10 px-2 py-1 text-sm">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </Card>

      <CenterModal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar producto' : 'Agregar producto'}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mb-3 w-full overflow-hidden rounded-xl bg-cream"
        >
          {preview ? (
            <img src={preview} alt="Preview" className="h-40 w-full object-cover" />
          ) : (
            <div className="py-8 text-center">
              <div className="text-4xl">📷</div>
              <p className="text-xs font-bold text-muted">Toca para subir foto</p>
            </div>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImg} />

        <Input label="Nombre del producto" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Inca Kola 500ml" />
        <Select label="Categoría" value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji} {c.nombre}</option>
          ))}
        </Select>
        <Input label="Precio de venta (S/)" type="number" step="0.10" min="0" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
        <Input label="Stock (unidades)" type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
        <Btn onClick={save}>Guardar</Btn>
        <Btn variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Btn>
      </CenterModal>
    </>
  );
}