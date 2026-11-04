import { departamentosACargo, rolesDe } from '@/lib/roles';

/**
 * Los comentarios de supervisión: a quién van y quién los ve. Lógica pura.
 *
 * Un jefe o un administrador comenta un registro —un conteo, una merma, un
 * anuncio— PARA un departamento. Ese departamento lo recibe como aviso y lo ve
 * dentro del registro; los demás no. Los comentarios sin destinatario (los de
 * antes de que existiera «para») los ven solo quienes supervisan.
 */

/** A quién se le puede dirigir un comentario. Las claves son las de `departamento` del usuario, más auditoría. */
export const DESTINOS_COMENTARIO = {
  inventario:  'Inventario',
  facturacion: 'Facturación',
  ca:          'Creación de Anuncio',
  auditoria:   'Auditoría',
};

/** Qué roles componen cada departamento destinatario. Su jefe se avisa aparte, por `departamento`. */
export const ROLES_DE_DESTINO = {
  inventario:  ['inv'],
  facturacion: ['fact'],
  ca:          ['ca', 'esp_anuncio'],
  auditoria:   ['auditor'],
};

/** Quienes supervisan ven todos los comentarios del registro. */
const SUPERVISORES = ['jefe_depto', 'administrador', 'superadmin'];

/** Cómo se llama cada tabla para quien lee el aviso, y a dónde lleva. */
export const REGISTRO_DE_TABLA = {
  inventarios:     { etiqueta: 'un conteo',     enlace: () => '/inventario' },
  mermas:          { etiqueta: 'una merma',      enlace: () => '/ajustes/disminucion?tab=mermas' },
  recepciones:     { etiqueta: 'una recepción',  enlace: (id) => `/recepciones/${id}` },
  anuncios_desact: { etiqueta: 'un anuncio',     enlace: () => '/anuncios' },
  lotes_ic:        { etiqueta: 'un caso de IC',  enlace: () => '/ic' },
};

/**
 * Los departamentos a los que pertenece una persona, por sus roles. Un jefe de
 * departamento pertenece al suyo.
 */
export function departamentosDe(usuario) {
  const suyos = rolesDe(usuario);
  const deptos = new Set();
  for (const [depto, roles] of Object.entries(ROLES_DE_DESTINO)) {
    if (roles.some((r) => suyos.includes(r))) deptos.add(depto);
  }
  for (const d of departamentosACargo(usuario)) deptos.add(d);
  return [...deptos];
}

/** ¿Supervisa? Ve todos los comentarios del registro. */
export const supervisa = (usuario) => rolesDe(usuario).some((r) => SUPERVISORES.includes(r));

/**
 * Los comentarios que esta persona debe ver: los dirigidos a su departamento y
 * los que escribió. Quien supervisa los ve todos.
 */
export function visiblesPara(comentarios, usuario) {
  const lista = comentarios ?? [];
  if (supervisa(usuario)) return lista;
  const mios = departamentosDe(usuario);
  return lista.filter((c) => (c.para_depto && mios.includes(c.para_depto)) || (usuario?.email && c.autor_id === usuario.email));
}

/** El comentario nuevo, tal como se guarda. */
export function nuevoComentario({ tabla, registroId, usuario, para, texto }) {
  return {
    tabla,
    registro_id: registroId,
    autor_id: usuario.email,
    autor_nombre: usuario.full_name || usuario.email,
    para_depto: para,
    comentario: texto,
  };
}

/** El aviso que recibe el destinatario. */
export function avisoDeComentario({ tabla, registroId, autor, para, producto, texto }) {
  const registro = REGISTRO_DE_TABLA[tabla] ?? { etiqueta: 'un registro', enlace: () => null };
  const recorte = texto.length > 140 ? `${texto.slice(0, 140)}…` : texto;
  return {
    titulo: `${autor} comentó ${registro.etiqueta} para ${DESTINOS_COMENTARIO[para] ?? para}`,
    mensaje: `${producto ? `${producto}: ` : ''}${recorte}`,
    enlace: registro.enlace(registroId),
  };
}
