-- ============================================================
-- Migration v34: corrige inv_delete_mermas (migration_v18), que
-- exigía estado_tarea = 'en_curso' — un estado que MermaForm.jsx
-- nunca asigna (siempre crea en 'pend_fact' o 'en_auditoria'). En la
-- práctica, INV jamás podía borrar su propia merma recién creada.
--
-- Nueva condición: INV puede borrar su propia merma mientras nadie
-- más (FACT o Auditor) haya escrito nada en ella todavía — sin
-- importar si la ruta fue con o sin factura.
--
-- EJECUTAR en: BD principal (bnopapasaiyksmndxvly.supabase.co) → SQL Editor
-- ============================================================

drop policy if exists "inv_delete_mermas" on mermas;

create policy "inv_delete_mermas" on mermas
  for delete
  using (
    public.get_user_role() = 'inv'
    and especialista_id = auth.email()
    and estado_tarea in ('pend_fact', 'en_auditoria')
    and fact_no_factura is null
    and auditor_id is null
  );
