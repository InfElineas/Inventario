-- ============================================================
-- Migration v18: permisos de eliminación para inventaristas
-- Solo pueden eliminar sus propios registros en estado 'en_curso'
-- EJECUTAR en: BD LOCAL (bnopapasaiyksmndxvly.supabase.co)
--              Dashboard → SQL Editor
-- ============================================================

-- Mermas: el inventarista solo elimina las suyas en estado en_curso
CREATE POLICY "inv_delete_mermas"
  ON mermas FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND especialista_id = auth.email()
    AND estado_tarea = 'en_curso'
  );

-- Inventarios: igual
CREATE POLICY "inv_delete_inventarios"
  ON inventarios FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND especialista_id = auth.email()
    AND estado_tarea = 'en_curso'
  );
