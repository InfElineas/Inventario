# Qué necesito para seguir con Facturación

Para responder sin ambigüedades me faltan **cuatro datos** que solo se ven en
el servidor, en el navegador o hablando con otras personas. Este documento
dice cuáles, cómo conseguir cada uno y qué pegarme.

Orden de importancia: el **paso 2** es el que más cambia el plan. Si solo
tienes tiempo para uno, haz ese.

Ninguno de los pasos cambia nada: todo es **lectura**.

---

## Paso 0. Comprobar qué hay en la web ahora mismo

**Para qué:** saber si la web que ves es la última versión. Del lado del
repositorio no hay cambios sin subir: todo lo escrito está en la rama
`feature/migracion-elineas-bd`, hasta `17c337a`. Lo último que cambió la
aplicación fue «Casos de IC» (`157afe7`); después solo se añadió documentación.

**Dónde:** en el servidor, por SSH.

```bash
cd /home/soporte/servidor/proyectos/Inventario-migracion && git fetch && git log --oneline -1 && git status -sb | head -3
```

**Qué pegarme:** la salida completa (2 o 3 líneas).

**Cómo sé que salió bien:**
- La línea `git log` empieza por `157afe7` o `17c337a` → el servidor tiene el
  código. Falta ver si **se reconstruyó** la imagen (siguiente paso).
- Empieza por otra cosa y la cabecera dice `[behind N]` → el servidor está
  atrasado: hay que desplegar.

**Si hay que desplegar** (incluye la migración de Casos de IC, que debe ir
**antes** de levantar la aplicación):

```bash
cd /home/soporte/servidor/proyectos/Inventario-migracion && git pull && docker exec -i ELINEAS_BD psql -U elineasadmin -d ELINEAS_BD -v ON_ERROR_STOP=1 < supabase/casos_ic.sql && docker compose -f docker-compose.prod.yml up -d --build inventario
```

**Cómo sé que ya es la última en el navegador:** entra en la web con F5 (o
Ctrl+F5). En el menú, bajo *Inventario*, tiene que aparecer **Casos de IC**.
Si no aparece, es que el navegador conserva la versión anterior.

---

## Paso 1. Traer el archivo de diagnóstico al servidor

**Para qué:** el paso 2 usa un archivo que está en el repositorio.

```bash
cd /home/soporte/servidor/proyectos/Inventario-migracion && git pull
```

Esto **solo descarga archivos**; no reconstruye la aplicación ni la toca.

**Cómo sé que salió bien:** responde algo como `Updating … Fast-forward` o
`Already up to date`, y existe el archivo:

```bash
ls supabase/diagnostico_fuentes.sql
```

---

## Paso 2. ¿La base ya tiene tablas de movimientos? (el importante)

**Para qué:** si `ELINEAS_BD` ya guarda ventas, transferencias o despachos,
las pantallas de Facturación se hacen con consultas propias, rápidas y sin
tocar TKC. Si no, hay que montar una copia sincronizada, que es bastante más
trabajo. Decide el tamaño de casi todo el plan.

**Dónde:** en el servidor, en la misma carpeta.

```bash
docker exec -i ELINEAS_BD psql -U elineasadmin -d ELINEAS_BD < supabase/diagnostico_fuentes.sql > /tmp/diagnostico_fuentes.txt 2>&1
```

No muestra nada en pantalla: lo escribe en un archivo. Para verlo:

```bash
wc -l /tmp/diagnostico_fuentes.txt && cat /tmp/diagnostico_fuentes.txt
```

**Qué pegarme:** todo lo que salga. Son cinco bloques, cada uno con su título
`=== N. … ===`.
- Si pasa de unas 300 líneas, pega al menos los **bloques 1, 3 y 4** y dime
  cuántas líneas tiene el resto.
- El bloque 5 puede acabar en `ERROR: schema "cron" does not exist`: es normal
  y sirve como respuesta.

**Cómo sé que salió bien:** el archivo empieza por
`=== 1. Tablas y vistas…` y contiene tus tablas conocidas (`mermas`,
`inventarios`, `lotes_ic`…).

**Si falla:**
- `no such container: ELINEAS_BD` → el nombre va en **mayúsculas**
  exactamente así; comprueba con `docker ps --format '{{.Names}}' | grep -i elineas`.
- `permission denied` → ejecútalo con el usuario del despliegue habitual.
- El archivo está vacío → mira el principio con `head -20 /tmp/diagnostico_fuentes.txt`
  y pégame esas líneas.

**Seguridad:** el archivo solo contiene `SELECT`. Puedes leerlo antes en
[supabase/diagnostico_fuentes.sql](../supabase/diagnostico_fuentes.sql).

---

## Paso 3. ¿El listado de ajustes ya trae las observaciones?

**Para qué:** si el listado ya devuelve la observación de cada documento,
«Observaciones de facturación TKC» queda casi hecho. Si no, hay que pedirla a
la API.

**Dónde:** en el navegador, con tu sesión iniciada.

1. Abre `/ajustes/aumento`.
2. Pulsa **F12** y entra en la pestaña **Red** (en inglés, *Network*).
3. Recarga la página (F5). Si hay muchas líneas, escribe `aumentos` en el
   filtro de la pestaña.
4. Pulsa la petición cuyo nombre empieza por `aumentos`.
5. Entra en la pestaña **Respuesta** (*Response*).
6. Copia **solo un documento** de la lista: desde su `{` hasta su `}`.

**Qué pegarme:** ese documento, y nada más. Tiene pinta de:
`{ "id": …, "code": "…", "date": "…", "status": "…" }` más lo que traiga.

**No me pegues:** cookies, cabeceras (*Headers*) ni ningún texto que diga
`Authorization` o `token`. Solo el cuerpo de la respuesta.

**Repite** lo mismo en `/ajustes/disminucion`, y además abre un documento con
«Ver productos» y copia **una línea** de la petición `…/lines`.

**Cómo sé que salió bien:** copiaste un bloque entre llaves, con un `id` y
una fecha.

**Si falla:** la lista sale vacía → cambia el almacén arriba a uno donde haya
documentos y vuelve a recargar.

---

## Paso 4. Preguntas al equipo de las APIs

**Para qué:** de transferencias, ventas directas y despachos no hay nada en el
código. Solo quien mantiene `elineas-transferencia` y `elineas-api` sabe si
exponen un listado.

**A quién:** a quien las mantenga.

**Qué preguntar** (tal cual, son cuatro):

1. ¿Existe un endpoint que **liste las transferencias entre almacenes**? ¿Cuál
   es la ruta y qué campos devuelve?
2. ¿Existe un informe de **ventas directas (VD)**? ¿Cuál es la ruta y qué
   campos devuelve?
3. ¿Existe un informe de **despachos** o de **ventas por período**? ¿Cuál es la
   ruta y qué campos devuelve?
4. ¿Hay **documentación** o una especificación OpenAPI? (Suele estar en `/docs`
   o `/openapi.json` de cada una.) Si es así, dime la URL o pégame el archivo.

**Qué pegarme:** sus respuestas tal cual. Si dicen «no existe» a una, también
me sirve: significa que hay que construirlo.

---

## Paso 5. Preguntas a Facturación (Janet)

**Para qué:** sin estas definiciones ni yo ni nadie puede calcular lo que
pide el botón ANÁLISIS sin contar dos veces el mismo movimiento.

Pregúntale y pégame sus respuestas:

1. **Despacho:** ¿es una salida por venta, una salida por transferencia, o las
   dos? ¿Un despacho y una venta de la misma mercancía son el **mismo**
   movimiento o dos?
2. **Numeración en TKC:** abriendo en TKC una **venta directa**, una
   **transferencia** y un **despacho**, ¿qué letras o prefijo lleva el número
   de cada documento? (Por ejemplo, los procesos llevan `TKCP`.) Un ejemplo
   real de cada uno basta.
3. **Alcance:** cada análisis, ¿es **por almacén** o necesita ver varios
   juntos?
4. **Período:** ¿fechas libres, o mes natural y corte semanal?
5. **Quién lo usa:** hoy las pantallas de facturación son de `fact`,
   `administrador` y `superadmin`. ¿Auditoría y jefes de departamento también?
6. **Si detecta una diferencia:** ¿solo la **ve**, o debe poder **abrir un
   ajuste** desde ahí?
7. **Exportar:** ¿Excel o CSV? (El sistema exporta CSV.)

**Cómo sé que salió bien:** las siete tienen respuesta, aunque sea «no sé».
Anota si alguna es «no sé»: me dice qué decisión tomo yo y qué dejo abierta.

---

## Cómo me lo mandas

Pega las respuestas en el chat, **numeradas por paso**:

```
Paso 0: <salida>
Paso 2: <salida, o bloques 1, 3 y 4>
Paso 3: <un documento de aumento, uno de disminución y una línea>
Paso 4: <respuestas del equipo>
Paso 5: <las siete respuestas>
```

No hace falta tenerlos todos a la vez. Con el **paso 2** ya puedo decirte qué
camino sigue el plan; el resto lo afina.

## Qué haré con cada respuesta

| Respuesta | Qué decido |
|---|---|
| Paso 2 muestra tablas de movimientos o ventas | F3, F4, F5 y F6 pasan a ser consultas propias; empiezo por el resumen de despachos |
| Paso 2 no muestra nada útil | Propongo una copia sincronizada desde TKC o un listado agregado de la API, y te digo cuál y por qué |
| Paso 3 trae `notes` o algo parecido | F1 se hace ya: solo falta pintarlo y poder buscar por él |
| Paso 3 no lo trae | Pido que la API lo exponga, o lo leo del documento en TKC |
| Paso 4 trae rutas | F4 y F5 son pantallas de consulta como la de ajustes |
| Paso 5, definición de despacho y prefijos | Fijo la regla que evita contar dos veces un movimiento (F6) |
