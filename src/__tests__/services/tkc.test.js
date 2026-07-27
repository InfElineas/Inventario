/**
 * Tests de la capa TKC. Todo lo que se prueba aquí es puro (sin red): el parseo
 * del login, la construcción del payload DataTables y la normalización de filas.
 * `client.js` y `normalize.listInventory` no se prueban porque solo pegan las
 * piezas y hacen la petición.
 */

import { describe, it, expect } from 'vitest'
import { extractCsrfToken, parseCookies, mergeCookies, getSetCookies } from '@/services/tkc/auth'
import { buildBody, COLS } from '@/services/tkc/body'
import { normalizeRow } from '@/services/tkc/normalize'
import { sortColumnIndex, TKC_COLUMN_DEFS, TKC_SORT_COLUMNS, IMAGE_COL } from '@/services/tkc/columns'
import { keyToTkcValue, warehouseName } from '@/services/tkc/warehouses'
import { buildSubmayorBody, pickRow, SUBMAYOR_COLS } from '@/services/tkc/submayor'

describe('auth', () => {
  it('extrae el token CSRF del HTML de login', () => {
    const html = '<form><input type="hidden" name="_csrf_token" value="AbC-123_x" /></form>'
    expect(extractCsrfToken(html)).toBe('AbC-123_x')
  })

  it('devuelve null si no hay token', () => {
    expect(extractCsrfToken('<form></form>')).toBeNull()
    expect(extractCsrfToken(null)).toBeNull()
  })

  it('parseCookies se queda solo con name=value y el último gana', () => {
    const headers = [
      'PHPSESSID=abc; Path=/; HttpOnly',
      'TKC=xyz; Path=/; Secure; SameSite=Lax',
      'PHPSESSID=def; Path=/',
    ]
    expect(parseCookies(headers)).toBe('PHPSESSID=def; TKC=xyz')
  })

  it('parseCookies ignora entradas sin "="', () => {
    expect(parseCookies(['basura', 'a=1'])).toBe('a=1')
  })

  it('mergeCookies fusiona y en conflicto gana el segundo', () => {
    expect(mergeCookies('a=1; b=2', 'b=9; c=3')).toBe('a=1; b=9; c=3')
    expect(mergeCookies('', 'a=1')).toBe('a=1')
    expect(mergeCookies('a=1', '')).toBe('a=1')
  })

  it('getSetCookies usa getSetCookie() cuando existe', () => {
    const headers = { getSetCookie: () => ['a=1', 'b=2'], get: () => null }
    expect(getSetCookies(headers)).toEqual(['a=1', 'b=2'])
  })

  it('getSetCookies parte la cabecera unida sin romper la coma de Expires', () => {
    // Fallback para Node < 19.7: la coma de "Wed, 01 Jan" no debe partir la cookie.
    const headers = {
      get: () => 'a=1; Expires=Wed, 01 Jan 2020 00:00:00 GMT; Path=/, b=2; Path=/',
    }
    expect(getSetCookies(headers)).toEqual([
      'a=1; Expires=Wed, 01 Jan 2020 00:00:00 GMT; Path=/',
      'b=2; Path=/',
    ])
  })
})

describe('buildBody', () => {
  const body = buildBody({ start: 100, length: 50, almacenes: ['351'] })

  it('declara las 24 columnas con sus 6 parámetros cada una', () => {
    expect(COLS).toHaveLength(24)
    COLS.forEach((col, i) => {
      expect(body).toContain(`columns%5B${i}%5D%5Bdata%5D=${col}`)
      expect(body).toContain(`columns%5B${i}%5D%5Bsearchable%5D=true`)
    })
  })

  it('mapea start/length y los valores por defecto del payload original', () => {
    expect(body).toContain('start=100')
    expect(body).toContain('length=50')
    expect(body).toContain('almacenes%5B%5D=351')
    expect(body).toContain('locaciones%5B%5D=all')
    expect(body).toContain('existencia=existencia')
    expect(body).toContain('tienda=todos')
    expect(body).toContain('inventario=todos')
    expect(body).toContain('temperatura%5B%5D=all')
    expect(body).toContain('publico_temporal=')
  })

  it('codifica la búsqueda y respeta columna/dirección de orden', () => {
    const b = buildBody({
      start: 0, length: 10, search: 'aceite & sal', orderColumn: 11, orderDir: 'desc',
    })
    expect(b).toContain('search%5Bvalue%5D=aceite%20%26%20sal')
    expect(b).toContain('order%5B0%5D%5Bcolumn%5D=11')
    expect(b).toContain('order%5B0%5D%5Bdir%5D=desc')
  })

  it('admite varios almacenes', () => {
    const b = buildBody({ start: 0, length: 10, almacenes: ['351', '184'] })
    expect(b).toContain('almacenes%5B%5D=351')
    expect(b).toContain('almacenes%5B%5D=184')
  })

  it('admite sobreescribir el filtro de existencia', () => {
    const b = buildBody({ start: 0, length: 10, existencia: 'no-existencia' })
    expect(b).toContain('existencia=no-existencia')
  })
})

describe('normalizeRow', () => {
  const raw = {
    id: 443507,
    codigo: '8033576196121',
    nombre: '<b>Aceite de oliva</b>  ',
    categoria_online: '- Alimentos - Aceites',
    precio: '1,234.56',
    cantidad: '19',
    peso: 2.205,
    fecha_vencimiento: '',
    locaciones: ['A1', 'B2'],
    controla_existencia: true,
    catalogo: {
      productName: 'Aceite de oliva',
      productDescription: 'Ingredientes: aceite',
      gtin: '8033576196121',
      fotos: [
        { foto: '/Images/a.jpg' },
        { foto: 'Images/b.jpg' },
        { foto: 'https://cdn.example.com/c.jpg' },
        { foto: '  ' },
      ],
    },
  }
  const row = normalizeRow(raw, 7, 'https://almendarestravel.com')

  it('quita el HTML de los textos y recorta', () => {
    expect(row.nombre).toBe('Aceite de oliva')
  })

  it('convierte números quitando el separador de millares', () => {
    expect(row.precio).toBe(1234.56)
    expect(row.cantidad).toBe(19)
    expect(row.peso).toBe(2.205)
  })

  it('devuelve null para números ausentes y "" para textos ausentes', () => {
    expect(row.volumen).toBeNull()
    expect(row.fechaVencimiento).toBe('')
    expect(normalizeRow({}, 0).precio).toBeNull()
  })

  it('aplana locaciones a un string', () => {
    expect(row.locaciones).toBe('A1, B2')
  })

  it('resuelve las rutas de imagen a absolutas y descarta vacías', () => {
    expect(row.imagenes).toEqual([
      'https://almendarestravel.com/Images/a.jpg',
      'https://almendarestravel.com/Images/b.jpg',
      'https://cdn.example.com/c.jpg',
    ])
    expect(row.imagen).toBe('https://almendarestravel.com/Images/a.jpg')
  })

  it('sin catálogo no explota y deja imagen vacía', () => {
    const r = normalizeRow({ id: 1, codigo: 'X' }, 0, 'https://x.test')
    expect(r.imagenes).toEqual([])
    expect(r.imagen).toBe('')
    expect(r.catalogo).toBe('')
  })

  it('rowId combina código, id e índice (key estable de React)', () => {
    expect(row.rowId).toBe('8033576196121|443507|7')
  })
})

describe('columns', () => {
  it('sortColumnIndex traduce la clave al índice del DataTables', () => {
    expect(sortColumnIndex('nombre')).toBe(5)
    expect(sortColumnIndex('cantidad')).toBe(11)
    expect(sortColumnIndex('precio')).toBe(12)
  })

  it('una clave desconocida cae en nombre, no en undefined', () => {
    expect(sortColumnIndex('inventada')).toBe(TKC_SORT_COLUMNS.nombre)
    expect(sortColumnIndex(undefined)).toBe(TKC_SORT_COLUMNS.nombre)
  })

  it('todas las columnas de datos son ordenables; la imagen no', () => {
    for (const def of TKC_COLUMN_DEFS) {
      if (def.key === IMAGE_COL) expect(TKC_SORT_COLUMNS[def.key]).toBeUndefined()
      else expect(TKC_SORT_COLUMNS[def.key]).toBeTypeOf('number')
    }
  })

  it('el índice de orden apunta a la columna correcta de COLS', () => {
    // Contrato con body.js: si los índices se desalinean, TKC ordena por otra cosa.
    expect(COLS[TKC_SORT_COLUMNS.nombre]).toBe('nombre')
    expect(COLS[TKC_SORT_COLUMNS.cantidad]).toBe('cantidad')
    expect(COLS[TKC_SORT_COLUMNS.marca]).toBe('marca')
    expect(COLS[TKC_SORT_COLUMNS.fechaVencimiento]).toBe('fecha_vencimiento')
  })
})

describe('warehouses', () => {
  it('traduce la clave de la app al id de TKC', () => {
    expect(keyToTkcValue('789')).toBe('351')
    expect(keyToTkcValue('Latino')).toBe('849')
    expect(keyToTkcValue(' 615 ')).toBe('184')
  })

  it('una clave desconocida devuelve null en vez de lanzar', () => {
    expect(keyToTkcValue('9999')).toBeNull()
    expect(keyToTkcValue('')).toBeNull()
    expect(keyToTkcValue(null)).toBeNull()
  })

  it('warehouseName degrada a "Almacén N" si no está en el catálogo', () => {
    expect(warehouseName('789')).toBe('TKC SUB 789')
    expect(warehouseName('9999')).toBe('Almacén 9999')
  })
})

describe('submayor', () => {
  const body = buildSubmayorBody({ start: 0, length: 25, almacen: '351', search: '139494' })

  it('manda el almacén en singular y la búsqueda global', () => {
    expect(body).toContain('almacen=351')
    expect(body).toContain('search%5Bvalue%5D=139494')
  })

  it('existencia es un booleano aquí, y false significa "sin filtrar"', () => {
    // Con true un producto a cero desaparecería y el popover diría "sin datos".
    expect(body).toContain('existencia=false')
    expect(buildSubmayorBody({ start: 0, length: 25, almacen: '351', soloConExistencia: true }))
      .toContain('existencia=true')
  })

  it('reproduce el orden de columnas de TKC, duplicados incluidos', () => {
    // nombre y precio salen dos veces: es la configuración del propio TKC.
    expect(SUBMAYOR_COLS[4]).toBe('nombre')
    expect(SUBMAYOR_COLS[13]).toBe('nombre')
    expect(SUBMAYOR_COLS[7]).toBe('existencia_fisica')
    expect(SUBMAYOR_COLS[8]).toBe('almacen')
    expect(SUBMAYOR_COLS[9]).toBe('tienda')
    SUBMAYOR_COLS.forEach((col, i) => {
      expect(body).toContain(`columns%5B${i}%5D%5Bdata%5D=${col}`)
    })
  })

  it('solo la columna 0 (checkbox) es no ordenable', () => {
    expect(body).toContain('columns%5B0%5D%5Borderable%5D=false')
    expect(body).toContain('columns%5B1%5D%5Borderable%5D=true')
  })

  it('pickRow exige coincidencia exacta: la búsqueda de TKC es un "contiene"', () => {
    const rows = [{ idTienda: 1394940 }, { idTienda: 139494 }]
    expect(pickRow(rows, '139494')).toEqual({ idTienda: 139494 })
    expect(pickRow(rows, '99999')).toBeNull()
    expect(pickRow([], '139494')).toBeNull()
    expect(pickRow(undefined, '139494')).toBeNull()
    expect(pickRow(rows, '')).toBeNull()
  })
})
