/**
 * Qué salió mal en una recepción.
 *
 * No se guarda en ninguna parte: se deduce de las líneas cada vez. Una copia
 * del informe envejecería por su cuenta —se corrige una línea y el informe
 * seguiría contando la versión vieja—, y las líneas ya no se tocan una vez
 * cerrada la recepción, así que lo que sale de aquí es estable.
 *
 * Lo mira quien recibe para saber qué reclamar, el jefe de departamento para
 * saber qué pasó, y facturación, que es quien tiene que cuadrar la factura
 * del proveedor contra lo que de verdad entró.
 */

/** De más a menos urgente. Ordena el informe y decide qué marca la recepción. */
const ORDEN = { alta: 0, media: 1, baja: 2 }

export const ETIQUETA_INCIDENCIA = {
  sin_contar:        'Sin contar',
  faltante:          'Faltante',
  sobrante:          'Sobrante',
  merma_origen:      'Merma de origen',
  calidad:           'Calidad deficiente',
  producto_nuevo:    'Producto nuevo',
  datos_incompletos: 'Datos sin confirmar',
}

const num = (v) => Number(v) || 0

/**
 * Las incidencias de una recepción, ordenadas por gravedad.
 *
 * @param {object} recepcion
 * @returns {Array<{tipo, gravedad, producto, codigo, detalle}>}
 */
export function incidenciasDe(recepcion) {
  const lista = []

  for (const d of recepcion?.detalles ?? []) {
    const de = (tipo, gravedad, detalle) => lista.push({
      tipo, gravedad, detalle,
      producto: d.producto_nombre ?? '',
      codigo: d.producto_codigo ?? '',
    })

    if (d.contada === false) {
      // Nadie la contó y la recepción se cerró igual. No es lo mismo que
      // llegar a cero: de esta línea no se sabe nada.
      de('sin_contar', 'alta', 'La recepción se cerró sin contar esta línea.')
    } else {
      const dif = num(d.diferencia)
      if (dif < 0) {
        de('faltante', 'alta',
          `Faltaron ${-dif}: se pidieron ${num(d.cant_esperada)} y llegaron ${num(d.cant_recibida)}.`)
      } else if (dif > 0) {
        de('sobrante', 'media',
          `Llegaron ${dif} de más: se pidieron ${num(d.cant_esperada)} y llegaron ${num(d.cant_recibida)}.`)
      }
    }

    const merma = num(d.cant_merma_origen)
    if (merma > 0) {
      const recibidas = num(d.cant_recibida)
      const pct = recibidas > 0 ? Math.round((merma / recibidas) * 100) : 0
      de('merma_origen', d.recomienda_devolucion ? 'alta' : 'media',
        `${merma} ${merma === 1 ? 'unidad llegó dañada' : 'unidades llegaron dañadas'}`
        + (recibidas > 0 ? ` (${pct}% de lo recibido)` : '')
        + (d.recomienda_devolucion ? '. Se recomienda devolver al proveedor.' : '.'))
    }

    if (d.calidad_ok === false) {
      de('calidad', 'alta', d.nota_calidad?.trim() || 'Marcada como deficiente, sin nota.')
    }

    if (d.nuevo_en_tkc) {
      de('producto_nuevo', 'media',
        `No existe en el catálogo: hay que darlo de alta. Código completo anotado: ${d.codigo_completo?.trim() || '—'}.`)
    }

    // Lo que inventario tenía que confirmar y no confirmó. No frena nada al
    // recibir —el camión no espera—, pero facturación lo necesita para
    // cuadrar la factura, así que queda escrito.
    if (d.contada !== false) {
      const faltan = []
      if (!String(d.gramaje ?? '').trim()) faltan.push('gramaje')
      if (!d.fecha_vencimiento) faltan.push('fecha de vencimiento')
      if (num(d.unidades_por_caja) <= 0) faltan.push('unidades por caja')
      if (!d.foto_id) faltan.push('foto de la presentación')
      if (faltan.length > 0) de('datos_incompletos', 'baja', `Sin ${faltan.join(', ')}.`)
    }
  }

  return lista.sort((a, b) => ORDEN[a.gravedad] - ORDEN[b.gravedad])
}

/**
 * ¿Hay algo que obligue a marcar la recepción y avisar?
 *
 * Los datos sin confirmar no cuentan: son un recordatorio, no una incidencia
 * con el proveedor, y marcar por ellos dejaría todas las recepciones en rojo.
 */
export const hayIncidencia = (lista) => lista.some((i) => i.gravedad !== 'baja')

/** «2 faltantes, 1 calidad deficiente» — para el título del aviso. */
export function resumenIncidencias(lista) {
  const cuenta = new Map()
  for (const i of lista) {
    if (i.gravedad === 'baja') continue
    cuenta.set(i.tipo, (cuenta.get(i.tipo) ?? 0) + 1)
  }
  return [...cuenta].map(([tipo, n]) => `${n} ${ETIQUETA_INCIDENCIA[tipo].toLowerCase()}`).join(', ')
}
