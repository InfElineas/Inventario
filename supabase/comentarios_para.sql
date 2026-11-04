--
-- A quién va dirigido un comentario de supervisión
--
-- Los comentarios de Supervisión se guardaban sin destinatario: nadie los
-- recibía y solo se veían desde la propia pantalla de supervisión. Ahora cada
-- comentario va PARA un departamento (inventario, facturacion, ca, auditoria),
-- que lo recibe como aviso y lo ve dentro del registro.
--
-- Los comentarios anteriores quedan con `para_depto` vacío: los ven solo quienes
-- supervisan.
--
-- EJECUTAR como elineasadmin:
--   docker exec -i ELINEAS_BD psql -U elineasadmin -d ELINEAS_BD < supabase/comentarios_para.sql
--

ALTER TABLE inventario.comentarios_supervision
  ADD COLUMN IF NOT EXISTS para_depto text;

COMMENT ON COLUMN inventario.comentarios_supervision.para_depto IS
  'Departamento al que va dirigido el comentario: inventario, facturacion, ca o auditoria. Vacío en los anteriores.';

-- «Los comentarios de este registro para mi departamento»: la consulta de cada detalle.
CREATE INDEX IF NOT EXISTS idx_comentarios_para
  ON inventario.comentarios_supervision (tabla, registro_id, para_depto);
