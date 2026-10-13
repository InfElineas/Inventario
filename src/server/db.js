/**
 * Conexión a ELINEAS_BD.
 *
 * La aplicación se conecta siempre como `elineas_backend_app`, que solo tiene
 * DML (SELECT/INSERT/UPDATE/DELETE). Crear o alterar objetos es tarea de
 * `elineasadmin`, y ningún contenedor usa ese usuario — es la norma de la guía
 * de trabajo del servidor.
 *
 * El host es el NOMBRE del contenedor (`ELINEAS_BD`) en la red `elineas_default`,
 * nunca una IP: las IP cambian cuando un contenedor se recrea.
 *
 *   DATABASE_URL=postgres://elineas_backend_app:<pass>@ELINEAS_BD:5432/ELINEAS_BD
 */

import pg from 'pg'

const { Pool } = pg

// Las columnas numeric de Postgres llegan como string para no perder precisión.
// Aquí son existencias y precios, que la aplicación trata como números; sin
// esto, `exist_fisica > 0` compararía cadenas y daría resultados absurdos.
const NUMERIC_OID = 1700
pg.types.setTypeParser(NUMERIC_OID, (valor) => (valor === null ? null : Number(valor)))

// bigint (int8). Las cantidades de TKC caben de sobra en un número de JS.
const INT8_OID = 20
pg.types.setTypeParser(INT8_OID, (valor) => (valor === null ? null : Number(valor)))

let pool = null

/** Pool compartido. Se crea en la primera consulta, no al importar el módulo. */
export function getPool() {
  if (pool) return pool

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Falta DATABASE_URL')
  }

  pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX) || 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // El esquema propio de esta aplicación, más public: ahí viven invGlobal y
    // subMayorGlobal, que son de uso general en el servidor.
    options: '-c search_path=inventario,public',
  })

  // Un error en una conexión ociosa no debe tumbar el proceso.
  pool.on('error', (error) => {
    console.error('[db] error en conexión ociosa:', error.message)
  })

  return pool
}

/**
 * Consulta suelta.
 * @param {string} texto SQL con marcadores $1, $2…
 * @param {unknown[]} valores
 */
export async function query(texto, valores = []) {
  return getPool().query(texto, valores)
}

/** Primera fila, o null. */
export async function queryOne(texto, valores = []) {
  const { rows } = await query(texto, valores)
  return rows[0] ?? null
}

/**
 * Ejecuta `fn` dentro de una transacción, con COMMIT o ROLLBACK automático.
 * Necesario para las escrituras que tocan varias tablas — por ejemplo cerrar
 * una merma, que además mueve existencias.
 */
export async function transaction(fn) {
  const cliente = await getPool().connect()
  try {
    await cliente.query('BEGIN')
    const resultado = await fn(cliente)
    await cliente.query('COMMIT')
    return resultado
  } catch (error) {
    await cliente.query('ROLLBACK')
    throw error
  } finally {
    cliente.release()
  }
}

/** Comprueba que la base responde. Para el healthcheck y el arranque. */
export async function ping() {
  const fila = await queryOne('SELECT current_user AS usuario, current_database() AS base')
  return fila
}

/** Cierra el pool. Solo para el apagado ordenado y los tests. */
export async function closePool() {
  if (!pool) return
  await pool.end()
  pool = null
}
