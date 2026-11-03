--
-- Una fotografía diaria de la existencia
--
-- El submayor que guarda la base (`sub_rows`, `sub_current`) son las últimas
-- corridas del cron: una semana, dos o tres al día. De la existencia de hace un
-- mes no queda nada, y sin ella no se puede conciliar un período largo: la
-- cuenta «existencia inicial + entradas − salidas = existencia final» no tiene
-- punto de partida.
--
-- Esta tabla guarda UNA fotografía por día, la primera que se tome ese día, y
-- se queda para siempre. No recupera el pasado —solo cubre desde que se
-- ejecute—, pero cada día que pasa mejora lo que se puede conciliar.
--
-- Solo se guardan las filas con existencia distinta de cero: una fila ausente
-- significa «cero». Son unas 58 000 filas al día en el catálogo entero, y la
-- mayoría de los productos están a cero.
--
-- La toma el servidor tras cada sincronización del catálogo
-- (src/server/syncApi.js), y se puede lanzar a mano o desde el cron del host:
--
--   SELECT inventario.fotografiar_existencias();
--
-- Es idempotente: si ya hay fotografía de hoy, no hace nada.
--
-- EJECUTAR como elineasadmin.
--

CREATE TABLE IF NOT EXISTS inventario.existencia_diaria (
  fecha        date    NOT NULL,
  almacen_num  text    NOT NULL,
  codigo       text    NOT NULL,
  existencia   numeric NOT NULL,
  PRIMARY KEY (fecha, almacen_num, codigo)
);

COMMENT ON TABLE inventario.existencia_diaria IS
  'Existencia física por almacén y producto, una fotografía por día (la primera '
  'del día). Sin fila significa existencia cero.';

-- La consulta típica es «la existencia de este producto en este almacén en
-- estas fechas».
CREATE INDEX IF NOT EXISTS idx_existencia_diaria_producto
  ON inventario.existencia_diaria (almacen_num, codigo, fecha);

CREATE OR REPLACE FUNCTION inventario.fotografiar_existencias(p_fecha date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = inventario, public
AS $$
DECLARE
  -- La fecha de Cuba, no la del servidor: una fotografía de las 23:30 no
  -- debe contar como del día siguiente.
  v_fecha date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Havana')::date);
  v_filas int;
BEGIN
  IF EXISTS (SELECT 1 FROM existencia_diaria WHERE fecha = v_fecha) THEN
    RETURN jsonb_build_object('fecha', v_fecha, 'ya_existia', true, 'filas', 0);
  END IF;

  -- DISTINCT ON: un código no debería repetirse en un almacén, pero si el
  -- submayor trajera dos filas, gana la más reciente en lugar de fallar.
  INSERT INTO existencia_diaria (fecha, almacen_num, codigo, existencia)
  SELECT DISTINCT ON (s.warehouse_key, s.codigo)
         v_fecha, s.warehouse_key, s.codigo, s.existencia_fisica
    FROM public.sub_current s
   WHERE s.existencia_fisica IS NOT NULL
     AND s.existencia_fisica <> 0
     AND s.warehouse_key IS NOT NULL
     AND s.codigo IS NOT NULL
   ORDER BY s.warehouse_key, s.codigo, s.updated_at DESC
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN jsonb_build_object('fecha', v_fecha, 'ya_existia', false, 'filas', v_filas);
END;
$$;

-- Lo invoca el backend tras sincronizar el catálogo.
GRANT SELECT ON inventario.existencia_diaria TO elineas_backend_app;
GRANT EXECUTE ON FUNCTION inventario.fotografiar_existencias(date) TO elineas_backend_app;

--
-- Resumen de ventas: el informe RDP, desde `public`
--
-- La pantalla «Resumen de ventas» lee `public.rdp_rows_latest`, la vista que
-- deja la última corrida de cada día. Los permisos sobre el esquema `public`
-- no están en ningún script nuestro. Si ya los tiene, esto no cambia nada; si
-- no, se los da. Y si elineasadmin no es dueño de la vista, avisa en lugar de
-- fallar: hace falta que lo dé quien lo sea.
--
DO $$
BEGIN
  GRANT SELECT ON public.rdp_rows_latest TO elineas_backend_app;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'No se pudo dar SELECT sobre public.rdp_rows_latest: elineasadmin no es su dueño. '
               'Dalo quien lo sea, o «Resumen de ventas» dará un error de permisos.';
END
$$;
