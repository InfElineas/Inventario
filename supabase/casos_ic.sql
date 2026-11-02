--
-- Casos de intervención comercial: quién respondió y cuándo
--
-- `lotes_ic` guardaba el caso que abre inventario sobre un lote por vencer y
-- nada más: sin estados posteriores a `pendiente`, sin quién lo atendió y sin
-- pantalla donde verlo salvo Supervisión. Comercial responde ahora desde
-- «Casos de IC» —aprueba la rebaja o dice que no procede— y se deja escrito
-- por quién y cuándo, para poder preguntarle.
--
-- La respuesta en sí va en `notas_ic`, que ya existía. Los estados nuevos
-- (`aprobado`, `rechazado`) no necesitan cambio: `estado_tarea` es texto libre.
--
-- EJECUTAR como elineasadmin.
--

ALTER TABLE inventario.lotes_ic
  ADD COLUMN IF NOT EXISTS respondido_por  text,
  ADD COLUMN IF NOT EXISTS fecha_respuesta timestamptz;

COMMENT ON COLUMN inventario.lotes_ic.respondido_por IS
  'Correo de quien de comercial aprobó o rechazó el caso.';
COMMENT ON COLUMN inventario.lotes_ic.fecha_respuesta IS
  'Cuándo se aprobó o rechazó. Vacía mientras el caso está pendiente.';

-- La pantalla lista por estado y de lo más reciente a lo más antiguo; sin esto
-- ordena toda la tabla cada vez que comercial mira lo pendiente.
CREATE INDEX IF NOT EXISTS idx_lotes_ic_estado
  ON inventario.lotes_ic (estado_tarea, created_date DESC);
