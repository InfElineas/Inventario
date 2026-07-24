-- ============================================================
-- Migration v19: rol superadmin con dominio total
-- EJECUTAR en: BD LOCAL (fiftxvdgwrbjudjtfhhi.supabase.co)
--              Dashboard → SQL Editor
-- ============================================================

-- 1. Función helper para verificar si el usuario actual es superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE email = auth.email()
      AND role  = 'superadmin'
      AND activo = true
  );
$$;

-- 2. Permitir que superadmin elimine mermas en cualquier estado
DROP POLICY IF EXISTS "superadmin_delete_mermas" ON mermas;
CREATE POLICY "superadmin_delete_mermas"
  ON mermas FOR DELETE
  USING (is_superadmin());

-- 3. Permitir que superadmin elimine inventarios en cualquier estado
DROP POLICY IF EXISTS "superadmin_delete_inventarios" ON inventarios;
CREATE POLICY "superadmin_delete_inventarios"
  ON inventarios FOR DELETE
  USING (is_superadmin());

-- 4. Permitir que superadmin elimine recepciones en cualquier estado
DROP POLICY IF EXISTS "superadmin_delete_recepciones" ON recepciones;
CREATE POLICY "superadmin_delete_recepciones"
  ON recepciones FOR DELETE
  USING (is_superadmin());

-- 5. Permitir que superadmin elimine anuncios en cualquier estado
DROP POLICY IF EXISTS "superadmin_delete_anuncios" ON anuncios_desact;
CREATE POLICY "superadmin_delete_anuncios"
  ON anuncios_desact FOR DELETE
  USING (is_superadmin());

-- 6. Asignar el rol superadmin al usuario de soporte
UPDATE usuarios
SET role = 'superadmin'
WHERE email = 'soporte@mercadoelineas.com';
