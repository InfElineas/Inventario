import { base44 } from '@/api/base44Client';
import {
  logTransicion, notificarTransicion, avisarConteoReemplazado,
} from '@/lib/workflowService';
import { registroFact, cierreSinAjuste } from '@/lib/conteosFact';
import { sentidoValido } from '@/lib/ajusteFact';

/**
 * Escribir en los conteos lo que pasa en las pantallas de ajustes.
 *
 * Antes facturación hacía el ajuste en una pantalla y volvía a «Conteos por
 * facturar» a teclear el número del documento en cada conteo. Aquí se hace de
 * una vez, con el documento que el ajuste acaba de crear.
 */

/**
 * Da por procesados estos conteos con el documento de TKC, y los manda a
 * auditoría. Los conteos ANTERIORES del mismo producto se cierran sin ajuste:
 * su diferencia se midió contra otra existencia y ajustarla además sería mover
 * dos veces la misma mercancía.
 *
 * Cada conteo va por separado y un fallo no tumba a los demás: lo que no se
 * pudo escribir se devuelve, para decirlo en vez de dejar a medias sin avisar.
 *
 * @param {{ conteos: Array<{ conteo: object, anteriores?: object[] }>,
 *           documento: string, estado?: string, notas?: string, sentido?: 'aumento'|'disminucion'|'transferencia',
 *           user: object }} p
 * @returns {Promise<{ hechos: object[], fallos: Array<{ conteo: object, motivo: string }> }>}
 */
export async function procesarConteos({ conteos, documento, estado, notas, sentido, user }) {
  const hechos = [];
  const fallos = [];

  for (const { conteo, anteriores = [] } of conteos) {
    // Poka-yoke: un documento no resuelve un conteo que va en sentido contrario.
    // Aunque la pantalla ya no lo ofrece, es lo último que se comprueba antes de
    // escribir en el conteo.
    if (!sentidoValido(sentido, conteo.resultado)) {
      fallos.push({ conteo, motivo: `es un ${conteo.resultado} y este documento va en sentido contrario` });
      continue;
    }
    try {
      // Una merma pendiente de facturación se resuelve igual que un conteo: mismo
      // registro de facturación y mismo paso a auditoría, en su propia entidad.
      const esMerma = conteo.origen_registro === 'merma';
      const datos = registroFact({ conteo, documento, estado, notas, user });
      await base44.entities[esMerma ? 'Merma' : 'Inventario'].update(conteo.id, datos);
      const tabla = esMerma ? 'mermas' : 'inventarios';
      logTransicion(tabla, conteo, datos.estado_tarea, user, datos).catch(() => {});
      notificarTransicion(tabla, { ...conteo, ...datos }, datos.estado_tarea, user).catch(() => {});
      hechos.push(conteo);
    } catch (e) {
      fallos.push({ conteo, motivo: e?.message ?? 'No se pudo escribir.' });
      continue;
    }

    for (const anterior of anteriores) {
      try {
        await base44.entities.Inventario.update(
          anterior.id, cierreSinAjuste({ anterior, vigente: conteo, user }),
        );
        await avisarConteoReemplazado(anterior, user);
      } catch { /* no puede impedir el procesamiento del que sí vale */ }
    }
  }
  return { hechos, fallos };
}

/**
 * Devuelve un conteo a inventario, con el motivo: sin él, quien lo contó recibe
 * un conteo rechazado sin saber qué corregir.
 */
export async function devolverConteo({ conteo, motivo, user }) {
  const datos = {
    estado_tarea: 'devuelto',
    fact_notas: motivo,
    fact_especialista_id: user?.email,
    fact_especialista_nombre: user?.full_name,
    fact_fecha: new Date().toISOString().slice(0, 10),
  };
  await base44.entities.Inventario.update(conteo.id, datos);
  logTransicion('inventarios', conteo, 'devuelto', user, datos).catch(() => {});
  notificarTransicion('inventarios', { ...conteo, ...datos }, 'devuelto', user).catch(() => {});
}
