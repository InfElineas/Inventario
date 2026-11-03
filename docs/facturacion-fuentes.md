# Facturación: de dónde salen los datos (F0)

**Para ejecutarlo paso a paso, ver [facturacion-pasos.md](facturacion-pasos.md).**

Primera tarea de [facturacion-mejoras.md](facturacion-mejoras.md). Lo que sigue
es lo que se puede afirmar leyendo el código y los documentos de contexto de
TKC, y lo que **solo se averigua mirando el servidor**, con el comando para
hacerlo. Sin esas respuestas no se puede dimensionar F1 a F6.

## Lo confirmado

| Necesidad | Fuente conocida | Qué sabemos | Qué no |
|---|---|---|---|
| Ajustes A/D | elineas-transferencia, `GET /api/v1/adjustments` y `/decreases`, más `/:id/lines` | La pantalla de ajustes ya los lista y enseña sus líneas. Al crear, la API acepta `notes` (hasta 500 caracteres): **el documento tiene un campo de observaciones** | Si el listado y las líneas **devuelven** ese campo. La pantalla solo pinta `id`, `code`, `date` y `status` |
| Subir y bajar de tienda | elineas-transferencia, `up-shop` y `down-shop`, más `jobs/:id` | Son órdenes y resultados de un trabajo, no un historial consultable | Si guarda un listado de movimientos pasados |
| Procesamientos | elineas-transferencia, `process/candidates`, `/documents`, `/analyze` | Hay un listado de documentos TKCP recientes | — |
| Movimientos de un producto | TKC, el «submayor» (tabla HTML) | Cada entrada y salida con **documento, saldo antes y después, usuario**. Cubre todo tipo de movimiento | Es **una petición por producto** y se lee HTML. No sirve para «todo un mes» |
| Ventas diarias | elineas-api, `GET /api/reports/rdp-ind-general-diario` | Una fila por producto con promedios de venta diaria. Se recalcula una vez al día | Es un **índice agregado**, no documentos: no sirve para VD ni para despachos |
| Lotes | La vista `lot_rows_latest` de nuestra base, que mantiene el cron central | Está **en ELINEAS_BD**, no detrás de una API | — |
| Mermas, conteos, casos de IC | Nuestras tablas | Todo | — |

Otros datos que dicen los documentos de contexto de TKC:

- Existe una **consolidación RDP con millones de registros históricos de
  movimientos**, cargada por n8n y Apps Script. No hay indicios de que Inventario
  la lea hoy; solo se usa su informe diario de ventas.
- **No hay API oficial de TKC documentada**: soporte confirma que existen
  endpoints REST, pero la documentación es restringida. Todo lo que se hace
  contra TKC desde aquí es leer su interfaz web.
- El nombre de los documentos que conocemos son `NoMT…` y `TKCP…`
  (procesamientos). **No hay en el código ningún prefijo de VD, transferencia o
  despacho.**

## Lo que no sé

Estas cuatro respuestas deciden el tamaño del resto. Se contestan en menos de
media hora.

### 1. ¿Hay ya en ELINEAS_BD alguna tabla o vista de movimientos?

El cron que alimenta `lot_rows_latest` quizá alimente más. En el servidor:

```bash
docker exec -i ELINEAS_BD psql -U elineasadmin -d ELINEAS_BD -c "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2;"
```

```bash
docker exec -i ELINEAS_BD psql -U elineasadmin -d ELINEAS_BD -c "SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE column_name ~* '(observ|nota|documento|transfer|despach|venta|salida|entrada)' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,3;"
```

Pegar la salida. Si aparece algo como movimientos, ventas o transferencias,
**F3, F4, F5 y F6 pasan a ser consultas SQL** —rápidas y sin tocar TKC— y
quedan resueltas las dos mayores incertidumbres.

### 2. ¿El listado de ajustes ya trae las observaciones?

No hace falta código. En el navegador, en `/ajustes/aumento`:

1. Abrir las herramientas de desarrollo (F12), pestaña *Red* (*Network*).
2. Recargar la página.
3. Pulsar la petición `aumentos?…` y copiar **un solo elemento** de la
   respuesta (sirve cualquiera; no lleva datos sensibles).

Si trae `notes` u otro campo parecido, **F1 es casi gratis**: solo falta
pintarlo. Si no, hay que pedir que la API lo exponga o leerlo del documento en
TKC.

Repetir con una disminución y con las líneas de un documento.

### 3. ¿Quién mantiene elineas-transferencia y elineas-api, y hay documentación?

Si las mantiene el mismo equipo, preguntarles:

- ¿Hay un listado de **transferencias entre almacenes**? ¿Con qué ruta?
- ¿Hay un informe de **ventas directas** y de **despachos**?
- ¿Tienen una documentación o una especificación OpenAPI (suele estar en
  `/docs` o `/openapi.json` de cada una)?

No están en esta máquina: ningún proyecto de `Proyectos/` los contiene.

### 4. ¿Cómo se llaman esos documentos en TKC?

Una persona de Facturación, abriendo en TKC una VD, una transferencia y un
despacho, puede decir cómo se llaman las pantallas y qué **prefijo** lleva
el número de cada documento (como `TKCP` en los procesos). Es lo que permite
reconocerlos en el submayor y separar un concepto de otro, que es el núcleo de
la conciliación (F6).

## Lo que cambia según la respuesta

| Si… | Entonces |
|---|---|
| El punto 1 encuentra los movimientos en la base | F3, F4, F5 y F6 son consultas propias. **Mejor caso.** F6 se puede hacer sin depender de TKC |
| Solo está en el submayor de TKC | Hace falta **una copia propia sincronizada** —como ya se hace con el catálogo— o un listado agregado de la API. Leer producto por producto no escala y TKC limita las peticiones por cuenta |
| El punto 2 trae las observaciones | F1 son horas de trabajo |
| El punto 2 no las trae | F1 depende de que el equipo de la API las exponga |
| El punto 3 devuelve un listado de transferencias | F4 es una pantalla de consulta, como la de ajustes |

## Qué haría yo sin esperar

Nada de código nuevo hasta tener el punto 1: si los movimientos están ya en
la base, todo lo demás cambia de forma. Lo único que se puede adelantar sin
riesgo es la **definición de «despacho»** con Janet (pregunta 1 de
[facturacion-mejoras.md](facturacion-mejoras.md)), porque sin ella F3 y F6 no
tienen una cifra que calcular.
