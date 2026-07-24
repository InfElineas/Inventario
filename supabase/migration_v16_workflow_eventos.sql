-- ============================================================
-- Migration v16: tabla workflow_eventos (audit trail completo)
-- Registra cada transición de estado en todos los workflows
-- EJECUTAR en: BD LOCAL (fiftxvdgwrbjudjtfhhi.supabase.co)
--              Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS workflow_eventos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla         text        NOT NULL,  -- 'mermas' | 'inventarios' | 'anuncios_desact' | 'lotes_ic'
  registro_id   uuid        NOT NULL,  -- id del registro afectado
  estado_antes  text,                  -- NULL en creación
  estado_nuevo  text        NOT NULL,
  actor_id      text        NOT NULL,  -- email del usuario que actuó
  actor_nombre  text,
  actor_rol     text,
  datos         jsonb       DEFAULT '{}', -- payload adicional (nota, factura, etc.)
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_eventos_registro ON workflow_eventos (tabla, registro_id);
CREATE INDEX IF NOT EXISTS idx_workflow_eventos_actor    ON workflow_eventos (actor_id);
CREATE INDEX IF NOT EXISTS idx_workflow_eventos_fecha    ON workflow_eventos (created_at DESC);

ALTER TABLE workflow_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_workflow_eventos" ON workflow_eventos FOR ALL USING (true) WITH CHECK (true);
