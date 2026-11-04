/**
 * Páginas de despachos de TKC para las pruebas.
 *
 * Están construidas a partir de los patrones que lee el workflow de n8n que
 * funciona en producción (`id="scrollableDespachos"`, `id="heading2026-07-01"`,
 * `despacho_item` con `data-id`, `form[_token]`…), no de capturas reales: si TKC
 * tiene otra estructura, estos analizadores fallan igual que fallaría el workflow.
 */

/** @param {Array<{ fecha: string, ids: string[] }>} activos  @param {Array<{ fecha: string, ids: string[] }>} [cerrados] */
export function paginaDespachos({ activos = [], cerrados = [] } = {}) {
  const grupo = ({ fecha, ids }) => `
    <div class="accordion-heading" id="heading${fecha}">${fecha}</div>
    ${ids.map((id) => `<div class="kt-widget4__item despacho_item" data-id="${id}">Despacho ${id}</div>`).join('\n')}`;
  return `<html><body><h3>Despachos Activos</h3>
    <div id="scrollableDespachos">${activos.map(grupo).join('\n')}</div>
    <h3>Despachos Cerrados</h3>
    <div id="scrollableDespachosCerrados">${cerrados.map(grupo).join('\n')}</div>
  </body></html>`;
}

/** La respuesta de `despacho-data`: con formulario de cierre, o sin él. */
export const despachoConFormulario = (token = 'tok123', { interno = '9001', numero = '55' } = {}) =>
  `<div><h4>#${interno} - Despacho #${numero}</h4>
    <p>Productos a despachar 3 / 3</p>
    <form><input type="hidden" name="form[_token]" value="${token}"></form></div>`;

export const despachoSinFormulario = () => '<div><h4>#9001 - Despacho #55</h4><p>Productos a despachar 3 / 3</p></div>';

export const despachoIncompleto = (hechos = 1, total = 3) =>
  `<div><h4>#9001 - Despacho #55</h4><p>Productos a despachar ${hechos} / ${total}</p></div>`;

export const paginaLogin = '<html><form><input name="_username"><input name="_password"></form></html>';
