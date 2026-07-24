-- ============================================================
-- Migration v10: rol jefe de departamento
-- EJECUTAR en Supabase SQL Editor
-- ============================================================

-- 1. Columna departamento en usuarios
--    Valores válidos: 'inventario' | 'facturacion' | 'ca' | NULL
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS departamento text;

-- 2. Tabla de comentarios de supervisión
CREATE TABLE IF NOT EXISTS comentarios_supervision (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla         text NOT NULL,     -- 'inventarios' | 'mermas' | 'anuncios_desact' | 'lotes_ic' | 'recepciones'
  registro_id   uuid NOT NULL,     -- id del registro comentado
  autor_id      text NOT NULL,     -- email del jefe que comenta
  autor_nombre  text,
  comentario    text NOT NULL,
  created_date  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_tabla_registro ON comentarios_supervision (tabla, registro_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_autor         ON comentarios_supervision (autor_id);

ALTER TABLE comentarios_supervision ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_comentarios" ON comentarios_supervision FOR ALL USING (true) WITH CHECK (true);
