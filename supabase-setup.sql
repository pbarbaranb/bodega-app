-- Ejecutar en Supabase SQL Editor (una sola vez)

-- Vincular usuarios con Supabase Auth
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id);

-- Row Level Security
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE costos ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

-- Políticas: solo autenticados
DROP POLICY IF EXISTS "auth_only" ON productos;
DROP POLICY IF EXISTS "auth_only" ON ventas;
DROP POLICY IF EXISTS "auth_only" ON venta_items;
DROP POLICY IF EXISTS "auth_only" ON costos;
DROP POLICY IF EXISTS "auth_only" ON usuarios;
DROP POLICY IF EXISTS "auth_only" ON categorias;

CREATE POLICY "auth_only" ON productos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_only" ON ventas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_only" ON venta_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_only" ON costos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_only" ON usuarios FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_only" ON categorias FOR ALL USING (auth.role() = 'authenticated');

-- Crear usuario Auth en Dashboard → Authentication → Users
-- Luego vincular en tabla usuarios:
-- UPDATE usuarios SET auth_id = '<uuid-del-auth-user>' WHERE nombre = 'Pedro';
