-- ============================================================
-- Migration v11: sincronización automática server-side
-- EJECUTAR en Supabase SQL Editor
-- ============================================================

-- 1. Tabla de registro de syncs automáticos
--    PRIMARY KEY (user_email, almacen) → un registro por almacén por usuario
CREATE TABLE IF NOT EXISTS sync_auto_log (
  user_email  text        NOT NULL,
  almacen     text        NOT NULL,
  synced_at   timestamptz NOT NULL DEFAULT now(),
  synced      int,
  errors      int,
  PRIMARY KEY (user_email, almacen)
);

ALTER TABLE sync_auto_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_sync_auto_log" ON sync_auto_log FOR ALL USING (true) WITH CHECK (true);

-- 2. Extensiones necesarias
--    pg_net  → llamadas HTTP desde PostgreSQL
--    pg_cron → tareas programadas
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 3. Job pg_cron: dispara la Edge Function cada minuto
--    Si ya existe un job con ese nombre, elimínalo primero:
--    SELECT cron.unschedule('sync-auto-trigger');
SELECT cron.schedule(
  'sync-auto-trigger',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://fiftxvdgwrbjudjtfhhi.supabase.co/functions/v1/sync-auto',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZnR4dmRnd3JianVkanRmaGhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDI3MTEsImV4cCI6MjA4OTY3ODcxMX0.Tpem2lK_Zu2YUV-7qehmTGPhej-hHpl4odBCy9JXVoY"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
