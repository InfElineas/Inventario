/**
 * Petición de credenciales de TKC al usuario.
 *
 * Cualquier llamada que acabe en TKC puede encontrarse con que el servidor
 * responde `no_tkc_credentials`. En vez de que cada pantalla lo maneje, el
 * servicio llama a `conCredencialesTkc`, que abre el diálogo global
 * (`TkcCredencialesDialog`), espera a que la persona las ponga y reintenta UNA
 * vez. Sin React aquí: el diálogo se suscribe a este módulo.
 */

const CODIGO = 'no_tkc_credentials'

let pendiente = null // Promise<boolean> compartida: varias llamadas, un solo diálogo
let resolverPendiente = null
const oyentes = new Set()

const avisar = () => oyentes.forEach((fn) => fn(pendiente !== null))

/** El diálogo se suscribe para abrirse/cerrarse. Devuelve la baja. */
export function suscribirPeticionTkc(fn) {
  oyentes.add(fn)
  fn(pendiente !== null)
  return () => oyentes.delete(fn)
}

/** Abre el diálogo; resuelve `true` si quedaron guardadas, `false` si canceló. */
export function pedirCredencialesTkc() {
  if (!pendiente) {
    pendiente = new Promise((resolve) => { resolverPendiente = resolve })
    avisar()
  }
  return pendiente
}

/** Lo llama el diálogo al terminar. */
export function resolverPeticionTkc(guardadas) {
  const resolver = resolverPendiente
  pendiente = null
  resolverPendiente = null
  avisar()
  resolver?.(guardadas)
}

/** ¿Es la respuesta del servidor «falta tu usuario de TKC»? Admite ambos formatos. */
export const faltanCredencialesTkc = (status, cuerpo) =>
  status === 403 && (cuerpo?.codigo === CODIGO || cuerpo?.error?.code === CODIGO)

/**
 * Ejecuta `peticion()` (que devuelve `{ status, body }`); si el servidor pide
 * credenciales de TKC, las pide a la persona y repite una vez.
 *
 * Es seguro repetir incluso una escritura: el servidor corta ANTES de tocar TKC.
 * Si cancela, se devuelve la respuesta original.
 */
export async function conCredencialesTkc(peticion) {
  const primera = await peticion()
  if (!faltanCredencialesTkc(primera.status, primera.body)) return primera
  return (await pedirCredencialesTkc()) ? peticion() : primera
}
