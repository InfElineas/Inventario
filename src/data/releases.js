/**
 * Las novedades de la web, de la más nueva a la más vieja.
 *
 * Cada vez que se sube un cambio que afecta a lo que la gente hace o ve —una
 * función nueva, un flujo distinto, un cambio de pantalla, un arreglo que se nota—
 * se añade aquí una entrada ARRIBA. Es lo que sale en la sección Novedades, en el
 * aviso de «hay una versión nueva» y en el diálogo que se enseña una vez tras
 * actualizar.
 *
 * Se escribe para quien usa la web, no para quien la programa: qué puede hacer
 * ahora o qué cambió, en una frase, sin nombres de archivos ni de funciones. Un
 * cambio que no se nota (refactor, pruebas, documentación) no lleva entrada.
 *
 * `version` es única y se compara con la última que vio cada persona. Es un texto
 * libre; el formato AAAA.MM.DD, con -2, -3… si hay más de una en el día, es solo
 * para que se lean en orden.
 *
 * Tipos de cambio: 'nuevo' (algo que antes no existía), 'mejora' (algo que ya
 * existía y ahora va mejor o distinto) y 'arreglo' (algo que fallaba).
 *
 * Este archivo es JavaScript sin imports: lo lee también la configuración de la
 * compilación para publicar la última entrada en `version.json`.
 */
export const TIPOS_DE_CAMBIO = ['nuevo', 'mejora', 'arreglo'];

export const RELEASES = [
  {
    version: '2026.11.06',
    fecha: '2026-11-06',
    titulo: 'Avisos de novedades, historial de mermas y cada quien ve lo suyo',
    cambios: [
      { tipo: 'nuevo', texto: 'La web avisa cuando hay una versión nueva y se actualiza con un botón, sin tener que recargar a ciegas.' },
      { tipo: 'nuevo', texto: 'Sección Novedades (Configuración): todo lo que va cambiando en la web, con su fecha.' },
      { tipo: 'nuevo', texto: 'Historial de mermas por almacén, en una pestaña nueva de Mermas.' },
      { tipo: 'mejora', texto: 'Cada usuario ve solo sus conteos y sus mermas, y solo de los almacenes que tiene configurados.' },
      { tipo: 'mejora', texto: 'Si un producto ya se contó hoy, se dice quién lo contó («Contado por…»).' },
      { tipo: 'mejora', texto: 'Los roles y los almacenes se actualizan solos: ya no hace falta recargar tras un cambio.' },
      { tipo: 'mejora', texto: 'Conteos, mermas y facturación usan ahora la misma lista de clasificaciones.' },
      { tipo: 'arreglo', texto: 'Al entrar se elige un solo almacén y ahora sí aparece el botón Aceptar.' },
    ],
  },
  {
    version: '2026.11.05',
    fecha: '2026-11-05',
    titulo: 'Por contar, productos sin ID y un panel que lleva a donde hay que actuar',
    cambios: [
      { tipo: 'nuevo', texto: 'Inventario abre en «Por contar»: los productos del almacén y suministrador elegidos, por orden de prioridad.' },
      { tipo: 'nuevo', texto: 'Los productos sin ID (insumos) ya se pueden contar y consultar en el submayor, buscándolos por código.' },
      { tipo: 'nuevo', texto: 'El filtro de suministrador permite elegir varios a la vez.' },
      { tipo: 'nuevo', texto: 'Cerrar despachos de TKC desde Inventario, con revisión previa.' },
      { tipo: 'mejora', texto: 'En el panel, «Por facturar» abre una tabla por caso, y los estados de la tienda llevan al catálogo ya filtrado.' },
      { tipo: 'mejora', texto: '«Se acaban primero» deja de listar agotados y habla en palabras: «Se acaba hoy», «Alcanza para 4 días».' },
      { tipo: 'mejora', texto: 'Cada error tiene su propia pantalla: no encontrada, sin acceso, servidor caído o sin conexión.' },
      { tipo: 'arreglo', texto: 'Un jefe de departamento que además factura ya puede gestionar ajustes y procesamientos.' },
    ],
  },
];
