--
-- Detección de casos de anuncio
--
-- `anuncios_desact` llevaba desde siempre vacía: la tabla existe, la pantalla
-- existe y el flujo INV → CA → auditoría existe, pero no había una sola línea
-- de código que insertara un caso. Esto es lo que faltaba.
--
-- QUÉ ES UN CASO
--
-- Medido contra /api/reports/ap-global-v2 del monorepo, que es el dueño de la
-- definición (57.183 productos en la última corrida):
--
--   ACTIVADO                  26.933
--   DESACTIVADO MUERTO EF=0   26.903
--   DESACTIVADO MUERTO EF>0      978   ← caso
--   SIN ID EF=0                2.164
--   SIN ID EF>0                  207   ← caso
--   DESACTIVADO EF=0 / EF>0        0
--
-- Dos cosas que esos números zanjan:
--
--  · «Desactivado sin estar muerto» da 0 HOY, pero EXISTE: las hojas de
--    inventario lo ven (184 con existencia solo en el 480). `ap_rows` no está
--    capturando el campo que lo distingue —guarda `is_dead` y
--    `status_provider`, que son complementarios—, así que no llega ni a la API
--    del monorepo ni aquí. El fallo está en `update-ap`; cuando se arregle,
--    esta detección empieza a abrir esos casos sin tocar nada.
--  · Lo que cuesta dinero es la EXISTENCIA, no el estado. Un anuncio muerto sin
--    stock no le hace daño a nadie; uno muerto con mercancía encima es dinero
--    parado que no se puede vender. Por eso solo se abre caso con EF > 0: de
--    otro modo serían 29.000 expedientes y la bandeja sería inservible.
--
-- `activo_ef_cero` existe en TIPO_CASO_LABELS pero aquí no se detecta: son
-- 13.803 productos, la mitad del catálogo activo, y agotarse es lo normal.
-- Tendría sentido el día que se pueda distinguir «se agotó ayer» de «lleva
-- agotado desde junio» — el changelog de la API (/api/state/ap/changes) lo
-- permitiría, pero nuestra copia no guarda ese historial.
--
-- LOS CASOS NO SE CIERRAN SOLOS. Si el stock baja a cero, el expediente sigue
-- abierto hasta que alguien lo resuelva: `ef_al_detectar` guarda cómo estaba al
-- detectarlo, y de eso se trata tener constancia. Cerrarlos solos borraría el
-- rastro de un anuncio que estuvo tres semanas con mercancía parada.
--
-- EJECUTAR como elineasadmin.
--

-- ── El almacén, que faltaba ─────────────────────────────────────────────
-- Mermas e inventarios lo llevan desde hace tiempo; esta tabla se quedó atrás.
-- Es derivable por `producto_id`, pero Facturación filtra por almacén todo el
-- día y no tiene sentido cruzar con `productos` en cada consulta.

ALTER TABLE inventario.anuncios_desact
  ADD COLUMN IF NOT EXISTS almacen_num text;

UPDATE inventario.anuncios_desact a
   SET almacen_num = p.almacen_num
  FROM inventario.productos p
 WHERE p.id = a.producto_id
   AND a.almacen_num IS NULL;

CREATE INDEX IF NOT EXISTS idx_anuncios_desact_almacen
    ON inventario.anuncios_desact (almacen_num, estado_tarea);

-- Un producto no puede tener dos casos abiertos del mismo tipo. Es lo que hace
-- que la detección se pueda repetir cuantas veces haga falta sin duplicar nada.
-- Los completados quedan fuera del índice a propósito: si el problema vuelve
-- después de resuelto, es un caso nuevo y merece su propio expediente.
CREATE UNIQUE INDEX IF NOT EXISTS anuncios_desact_caso_abierto
    ON inventario.anuncios_desact (producto_id, tipo_caso)
 WHERE estado_tarea <> 'completado';


-- ── La detección ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION inventario.detectar_casos_anuncio(p_almacen text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_abiertos int := 0;
BEGIN
  WITH problemas AS (
    SELECT p.id, p.nombre, p.codigo_producto, p.suministrador, p.almacen_num,
           p.estado_anuncio_tkc,
           COALESCE(p.exist_fisica, 0) AS exist_fisica,
           CASE p.estado_anuncio_tkc
             WHEN 'DESACTIVADO MUERTO EF>0' THEN 'desact_ef_positivo'
             WHEN 'DESACTIVADO EF>0'        THEN 'desact_ef_positivo'
             WHEN 'SIN ID EF>0'             THEN 'sin_id'
           END AS tipo_caso
      FROM inventario.productos p
     WHERE p.activo
       -- La existencia ya va dentro del estado (vocabulario de apGlobalV2),
       -- así que no hace falta filtrar por `exist_fisica` aparte. Y es más
       -- correcto: el estado se calcula con la cantidad del listado AP, no
       -- con la del submayor, que es otra fuente.
       AND p.estado_anuncio_tkc IN ('DESACTIVADO MUERTO EF>0', 'DESACTIVADO EF>0', 'SIN ID EF>0')
       AND (p_almacen IS NULL OR p.almacen_num = p_almacen)
  ),
  nuevos AS (
    INSERT INTO inventario.anuncios_desact (
      producto_id, producto_nombre, producto_codigo, suministrador, almacen_num,
      tipo_caso, estado_tarea, estado_anuncio_tkc, ef_al_detectar, fecha_deteccion
    )
    SELECT id, nombre, codigo_producto, suministrador, almacen_num,
           tipo_caso, 'pendiente', estado_anuncio_tkc, exist_fisica, current_date
      FROM problemas
    ON CONFLICT (producto_id, tipo_caso) WHERE estado_tarea <> 'completado'
      DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_abiertos FROM nuevos;

  RETURN jsonb_build_object(
    'almacen',  COALESCE(p_almacen, 'todos'),
    'abiertos', v_abiertos,
    'momento',  now()
  );
END;
$$;

COMMENT ON FUNCTION inventario.detectar_casos_anuncio(text) IS
  'Abre casos en anuncios_desact para los productos con problema (muerto o sin '
  'id, ambos con existencia). Idempotente: no duplica casos ya abiertos.';

GRANT EXECUTE ON FUNCTION inventario.detectar_casos_anuncio(text) TO elineas_backend_app;
