import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/api/supabaseClient'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, Loader2, X, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'

// ── Normalización de valores ──────────────────────────────────
const ESTADO_MAP = {
  'Completado': 'completado', 'completado': 'completado',
  'En Curso': 'en_curso', 'En curso': 'en_curso', 'en_curso': 'en_curso',
  'Pendiente': 'en_curso', 'pendiente': 'en_curso',
  'Auditor': 'en_auditoria', 'auditor': 'en_auditoria',
}
const RESULTADO_MAP = {
  'OK': 'ok', 'Ok': 'ok', 'ok': 'ok',
  'Faltante': 'faltante', 'faltante': 'faltante',
  'Sobrante': 'sobrante', 'sobrante': 'sobrante',
}

// ── Normaliza clave para comparación (sin acentos, lowercase) ──
function nk(str) {
  return String(str ?? '').toLowerCase().trim()
    .replace(/[áàâä]/g,'a').replace(/[éèêë]/g,'e')
    .replace(/[íìîï]/g,'i').replace(/[óòôö]/g,'o')
    .replace(/[úùûü]/g,'u').replace(/[ñ]/g,'n')
    .replace(/\.$/, '')   // quita punto final
}

// ── Lookup de columna con múltiples variantes ──
// Crea un índice normalizado una sola vez por fila
function buildRowIndex(row) {
  const idx = {}
  for (const [k, v] of Object.entries(row)) {
    idx[nk(k)] = v
  }
  return idx
}

function col(idx, ...keys) {
  for (const k of keys) {
    const v = idx[nk(k)]
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
  }
  return undefined
}

// ── Utilidades de parseo ──────────────────────────────────────
function parseDate(val) {
  if (!val) return null
  if (val instanceof Date && !isNaN(val)) return val.toISOString().slice(0, 10)
  if (typeof val === 'string' && val.trim()) {
    const parts = val.split('/')
    if (parts.length === 3) {
      const [d, m, y] = parts
      const iso = `${y.length === 2 ? '20' + y : y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
      const date = new Date(iso)
      if (!isNaN(date)) return iso
    }
    const parsed = new Date(val)
    if (!isNaN(parsed)) return parsed.toISOString().slice(0, 10)
  }
  return null
}

function parseNum(val) {
  if (val === undefined || val === null || val === '') return 0
  const n = parseFloat(String(val).replace(/[$,\s]/g, ''))
  return isNaN(n) ? 0 : n
}

const s = (val) => String(val ?? '').trim()

// ── Mapeo de filas ────────────────────────────────────────────
function mapAjusteRow(row, idMap, codigoMap) {
  const idx = buildRowIndex(row)
  const idTienda = s(col(idx, 'IdTienda', 'id tienda', 'idtienda') ?? '')
  const codigo   = s(col(idx, 'Cód. Prod.', 'Cod. Prod.', 'codigo', 'codigo producto', 'Cód. Prod') ?? '')
  const productoId = idMap[idTienda] || codigoMap[codigo] || null

  return {
    _matched:               Boolean(productoId),
    _idTienda:              idTienda,
    _codigo:                codigo,
    _nombre:                s(col(idx, 'Nombre', 'nombre producto') ?? ''),
    producto_id:            productoId,
    producto_nombre:        s(col(idx, 'Nombre', 'nombre producto') ?? ''),
    producto_codigo:        codigo,
    suministrador:          s(col(idx, 'Suministrador') ?? ''),
    fecha_inv:              parseDate(col(idx, 'Fecha Inv.', 'Fecha Inv', 'fecha inv')),
    especialista_nombre:    s(col(idx, 'Especialista INV', 'especialista inv', 'especialista') ?? ''),
    exist_fisica_tkc:       parseNum(col(idx, 'Exist. Física', 'Exist. Fisica', 'Exist. física TKC', 'exist fisica')),
    conteo_real:            parseNum(col(idx, 'Conteo Real', 'conteo real')),
    diferencia:             parseNum(col(idx, 'Dif. TKC-Real', 'dif tkc-real', 'diferencia')),
    resultado:              RESULTADO_MAP[s(col(idx, 'Resultado TKC-Real', 'resultado tkc-real', 'resultado') ?? '')] || null,
    fact_valor_total:       parseNum(col(idx, '$ Total', 'total', 'valor total')),
    clasif_ajuste:          s(col(idx, 'Clasif. INV', 'clasif inv', 'clasificacion') ?? ''),
    notas_inv:              s(col(idx, 'Notas INV', 'notas inv', 'nota inv') ?? ''),
    fact_fecha:             parseDate(col(idx, 'Fecha Retiro FACT', 'fecha retiro fact')),
    fact_especialista_nombre: s(col(idx, 'Especialista FACT', 'especialista fact') ?? ''),
    fact_no_factura:        s(col(idx, 'No. Factura TKC', 'no factura tkc', 'factura') ?? ''),
    fact_clasif:            s(col(idx, 'Clasif. FACT', 'clasif fact') ?? ''),
    fact_notas:             s(col(idx, 'Notas FACT', 'notas fact') ?? ''),
    auditor_nombre:         s(col(idx, 'Auditor') ?? ''),
    nota_auditor:           s(col(idx, 'Notas auditor', 'notas auditores') ?? ''),
    estado_tarea:           inferEstadoAjuste(idx),
  }
}

function inferEstadoAjuste(idx) {
  const raw = s(col(idx, 'Estado Tarea', 'estado tarea') ?? '')
  if (ESTADO_MAP[raw]) return ESTADO_MAP[raw]

  const resultado       = s(col(idx, 'Resultado TKC-Real', 'resultado tkc-real', 'resultado') ?? '').toLowerCase()
  const tieneAuditor    = Boolean(s(col(idx, 'Auditor') ?? ''))
  const tieneFactura    = Boolean(s(col(idx, 'No. Factura TKC', 'no factura tkc') ?? ''))
  const tieneClasifFact = Boolean(s(col(idx, 'Clasif. FACT', 'clasif fact') ?? ''))
  const tieneEspecFact  = Boolean(s(col(idx, 'Especialista FACT', 'especialista fact') ?? ''))

  if (tieneAuditor && (tieneFactura || tieneClasifFact)) return 'completado'
  if (tieneFactura || tieneClasifFact || tieneEspecFact) return 'en_auditoria'
  // Sin diferencia y sin acción pendiente → ya está resuelto
  if (resultado === 'ok') return 'completado'
  return 'en_curso'
}

function mapMermaRow(row, idMap, codigoMap) {
  const idx = buildRowIndex(row)
  const idTienda = s(col(idx, 'idTienda', 'IdTienda', 'id tienda') ?? '')
  const codigo   = s(col(idx, 'Cód. Prod.', 'Cod. Prod.', 'codigo', 'codigo producto') ?? '')
  const productoId = idMap[idTienda] || codigoMap[codigo] || null

  return {
    _matched:               Boolean(productoId),
    _idTienda:              idTienda,
    _codigo:                codigo,
    _nombre:                s(col(idx, 'Nombre', 'nombre producto') ?? ''),
    producto_id:            productoId,
    producto_nombre:        s(col(idx, 'Nombre', 'nombre producto') ?? ''),
    producto_codigo:        codigo,
    suministrador:          s(col(idx, 'Suministrador') ?? ''),
    fecha_inv:              parseDate(col(idx, 'Fecha Inv', 'Fecha Inv.', 'fecha inv')),
    cantidad:               parseNum(col(idx, 'Cant.', 'cantidad')),
    precio_unitario:        parseNum(col(idx, 'Precio u', 'precio unitario', 'precio')),
    total_perdida:          Math.abs(parseNum(col(idx, 'Total $', '$ total', 'total', 'total perdida'))),
    especialista_nombre:    s(col(idx, 'Especialista INV', 'especialista inv', 'especialista') ?? ''),
    clasif_merma:           s(col(idx, 'Clasif. INV', 'clasif inv', 'clasificacion') ?? ''),
    notas:                  s(col(idx, 'Nota INV', 'Notas INV', 'nota inv', 'notas') ?? ''),
    fact_fecha:             parseDate(col(idx, 'Fecha Retiro FACT', 'fecha retiro fact')),
    fact_especialista_nombre: s(col(idx, 'Especialista FACT', 'especialista fact') ?? ''),
    fact_no_factura:        s(col(idx, 'No. Factura TKC', 'no factura tkc', 'factura') ?? ''),
    fact_clasif:            s(col(idx, 'Clasif. FACT', 'clasif fact') ?? ''),
    fact_notas:             s(col(idx, 'Notas FACT', 'notas fact') ?? ''),
    auditor_nombre:         s(col(idx, 'Auditor') ?? ''),
    nota_auditor:           s(col(idx, 'Notas auditores', 'Notas auditor', 'notas auditor') ?? ''),
    estado_tarea:           ESTADO_MAP[s(col(idx, 'Estado Tarea', 'estado tarea') ?? '')] || 'completado',
    activo:                 true,
    requiere_fact:          Boolean(s(col(idx, 'Especialista FACT', 'especialista fact') ?? '')),
  }
}

// ── Componente principal ──────────────────────────────────────
export default function TabImportar() {
  const [file,          setFile]          = useState(null)
  const [wb,            setWb]            = useState(null)
  const [sheets,        setSheets]        = useState([])
  const [selectedSheet, setSelectedSheet] = useState(null)
  const [preview,       setPreview]       = useState([])
  const [allRows,       setAllRows]       = useState([])
  const [matchStats,    setMatchStats]    = useState(null)
  const [detectedCols,  setDetectedCols]  = useState([])   // columnas reales del Excel
  const [showCols,      setShowCols]      = useState(false)
  const [status,        setStatus]        = useState('idle')
  const [progress,      setProgress]      = useState(0)
  const [result,        setResult]        = useState(null)
  const fileRef = useRef()

  async function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f); setStatus('parsing'); setSelectedSheet(null)
    setAllRows([]); setPreview([]); setMatchStats(null)
    setResult(null); setDetectedCols([])
    try {
      const ab = await f.arrayBuffer()
      const workbook = XLSX.read(ab, { type: 'array', cellDates: true })
      setWb(workbook); setSheets(workbook.SheetNames)
      const known = workbook.SheetNames.find(n => n === 'BD Ajuste I-F' || n === 'BD Merma')
      if (known) await parseSheet(workbook, known)
      else setStatus('pick_sheet')
    } catch { setStatus('error') }
  }

  async function parseSheet(workbook, sheetName) {
    setSelectedSheet(sheetName); setStatus('parsing')
    setAllRows([]); setPreview([]); setMatchStats(null)

    const sheet = workbook.Sheets[sheetName]
    const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '', cellDates: true })

    // Guardar columnas reales para diagnóstico
    const firstRow = rows[0] || {}
    const colNames = Object.keys(firstRow)
    setDetectedCols(colNames)

    // Filtrar filas vacías usando lookup normalizado
    const dataRows = rows.filter(r => {
      const idx = buildRowIndex(r)
      return Boolean(col(idx, 'Nombre', 'nombre producto'))
    })

    if (dataRows.length === 0) { setStatus('pick_sheet'); return }

    // Detectar almacén
    const idx0 = buildRowIndex(dataRows[0])
    const almacenNum = s(col(idx0, 'No. Almacén', 'No. Almacen', 'almacen', 'almacén', 'no almacen') ?? '')

    // Cargar productos para match
    let query = supabase.from('productos').select('id, id_tienda, codigo_producto')
    if (almacenNum) query = query.eq('almacen_num', almacenNum)
    const { data: products = [], error: qErr } = await query
    if (qErr) console.error('productos query error:', qErr)

    const idMap = {}; const codigoMap = {}
    for (const p of products) {
      if (p.id_tienda)       idMap[s(p.id_tienda)]          = p.id
      if (p.codigo_producto) codigoMap[s(p.codigo_producto)] = p.id
    }

    const isAjuste = sheetName === 'BD Ajuste I-F'
    const mapped = dataRows.map(r =>
      isAjuste ? mapAjusteRow(r, idMap, codigoMap) : mapMermaRow(r, idMap, codigoMap)
    )

    const matched = mapped.filter(r => r._matched).length
    setMatchStats({
      total: mapped.length, matched, unmatched: mapped.length - matched,
      almacenNum, productosEnBD: products.length,
    })
    setAllRows(mapped); setPreview(mapped.slice(0, 5)); setStatus('ready')
  }

  async function handleImport() {
    const table    = selectedSheet === 'BD Ajuste I-F' ? 'inventarios' : 'mermas'
    const toInsert = allRows
      .filter(r => r._matched)
      .map(({ _matched, _idTienda, _codigo, _nombre, ...r }) => r)

    if (!toInsert.length) return

    const BATCH = 50; let done = 0; let errors = 0
    setStatus('importing'); setProgress(0)

    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH)
      const { error } = await supabase.from(table).insert(batch)
      if (error) { errors += batch.length; console.error('import error:', error) }
      else done += batch.length
      setProgress(Math.round(((i + batch.length) / toInsert.length) * 100))
    }

    setResult({ done, errors, skipped: allRows.length - toInsert.length, table })
    setStatus('done')
  }

  function reset() {
    setFile(null); setWb(null); setSheets([]); setSelectedSheet(null)
    setPreview([]); setAllRows([]); setMatchStats(null); setDetectedCols([])
    setStatus('idle'); setProgress(0); setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const isAjuste = selectedSheet === 'BD Ajuste I-F'
  const previewCols = isAjuste
    ? ['_nombre','fecha_inv','especialista_nombre','conteo_real','resultado','estado_tarea']
    : ['_nombre','fecha_inv','cantidad','clasif_merma','total_perdida','estado_tarea']

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold">Importar datos históricos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Importa registros desde archivos <span className="font-mono text-xs">INV_###_V1_4.xlsx</span>.
          Hojas soportadas: <strong>BD Ajuste I-F</strong> → inventarios · <strong>BD Merma</strong> → mermas.
        </p>
      </div>

      {/* Drop zone */}
      {(status === 'idle' || !file) && (
        <Card
          className="border-dashed cursor-pointer hover:bg-accent/30 transition-colors"
          style={{ borderRadius: '12px', borderWidth: '1.5px' }}
          onClick={() => fileRef.current?.click()}
        >
          <div className="p-10 flex flex-col items-center gap-3">
            <FileSpreadsheet className="w-10 h-10 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium text-sm">Seleccionar archivo Excel</p>
              <p className="text-xs text-muted-foreground mt-1">Archivos .xlsx únicamente</p>
            </div>
            <Button variant="outline" size="sm" style={{ borderRadius: '8px' }}
              onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Elegir archivo
            </Button>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        </Card>
      )}

      {status === 'parsing' && (
        <Card className="p-5 flex items-center gap-3" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="text-sm">Analizando archivo y buscando productos...</span>
        </Card>
      )}

      {status === 'pick_sheet' && (
        <Card className="p-5 space-y-3" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
          <p className="text-sm font-medium">Selecciona la hoja a importar</p>
          <div className="flex flex-wrap gap-2">
            {sheets.map(name => (
              <Button key={name} variant="outline" size="sm" style={{ borderRadius: '8px' }}
                onClick={() => parseSheet(wb, name)}>{name}</Button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={reset} style={{ borderRadius: '8px' }}>
            <X className="w-3.5 h-3.5 mr-1" /> Cancelar
          </Button>
        </Card>
      )}

      {(status === 'ready' || status === 'importing' || status === 'done') && matchStats && (
        <div className="space-y-4">
          {/* File header */}
          <Card className="p-4" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{file?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Hoja: <strong>{selectedSheet}</strong>
                    {matchStats.almacenNum && <> · Almacén <strong>{matchStats.almacenNum}</strong></>}
                    {' · '}{matchStats.productosEnBD} productos en BD
                    {sheets.length > 1 && status !== 'done' && (
                      <button className="ml-2 text-primary underline-offset-2 hover:underline"
                        onClick={() => setStatus('pick_sheet')}>cambiar hoja</button>
                    )}
                  </p>
                </div>
              </div>
              {status !== 'importing' && (
                <Button variant="ghost" size="icon" onClick={reset} className="h-8 w-8">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </Card>

          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4 text-center" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
              <p className="text-2xl font-bold">{matchStats.total}</p>
              <p className="text-xs text-muted-foreground mt-1">Filas totales</p>
            </Card>
            <Card className="p-4 text-center" style={{ borderRadius: '12px', borderWidth: '0.5px', background:'rgba(74,222,128,0.05)' }}>
              <p className="text-2xl font-bold text-[#4ade80]">{matchStats.matched}</p>
              <p className="text-xs text-muted-foreground mt-1">Con producto</p>
            </Card>
            <Card className="p-4 text-center" style={{ borderRadius: '12px', borderWidth: '0.5px', background:'rgba(245,158,11,0.05)' }}>
              <p className="text-2xl font-bold text-[#f59e0b]">{matchStats.unmatched}</p>
              <p className="text-xs text-muted-foreground mt-1">Sin match</p>
            </Card>
          </div>

          {/* Panel de diagnóstico de columnas */}
          {detectedCols.length > 0 && status !== 'done' && (
            <button
              className="w-full flex items-center justify-between text-xs text-muted-foreground px-3 py-2 rounded-lg border hover:bg-accent/30 transition-colors"
              style={{ borderRadius: '8px' }}
              onClick={() => setShowCols(v => !v)}
            >
              <span>Columnas detectadas en el Excel ({detectedCols.length})</span>
              {showCols ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
          {showCols && (
            <Card className="p-3" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
              <div className="flex flex-wrap gap-1.5">
                {detectedCols.map(c => (
                  <span key={c} className="text-xs bg-secondary px-2 py-0.5 rounded font-mono">{c}</span>
                ))}
              </div>
            </Card>
          )}

          {/* Preview */}
          <Card style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
            <div className="p-3 border-b">
              <p className="text-xs font-medium text-muted-foreground">Vista previa — primeras 5 filas</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    {previewCols.map(c => (
                      <th key={c} className="p-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                        {c.replace(/^_/, '')}
                      </th>
                    ))}
                    <th className="p-2 text-center font-medium text-muted-foreground">match</th>
                    <th className="p-2 text-left font-medium text-muted-foreground">IdTienda / Cód</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {previewCols.map(c => (
                        <td key={c} className="p-2 max-w-[130px] truncate text-muted-foreground">
                          {String(row[c] ?? '—')}
                        </td>
                      ))}
                      <td className="p-2 text-center">
                        {row._matched
                          ? <CheckCircle className="w-3.5 h-3.5 text-[#4ade80] mx-auto" />
                          : <AlertTriangle className="w-3.5 h-3.5 text-[#f59e0b] mx-auto" />}
                      </td>
                      <td className="p-2 text-[10px] text-muted-foreground font-mono">
                        {row._idTienda || '—'} / {row._codigo || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Warning unmatched */}
          {matchStats.unmatched > 0 && (
            <div className="flex items-start gap-2 text-xs text-[#f59e0b] bg-[#f59e0b]/10 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                {matchStats.unmatched} fila(s) sin producto coincidente serán omitidas.
                {matchStats.productosEnBD === 0 && ' ⚠️ No se encontraron productos en BD — sincroniza el almacén primero.'}
              </span>
            </div>
          )}

          {status === 'ready' && (
            <Button onClick={handleImport} disabled={matchStats.matched === 0}
              className="w-full" style={{ borderRadius: '8px' }}>
              <Upload className="w-4 h-4 mr-2" />
              Importar {matchStats.matched} registros en {isAjuste ? 'inventarios' : 'mermas'}
            </Button>
          )}

          {status === 'importing' && (
            <Card className="p-4 space-y-3" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Importando... {progress}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }} />
              </div>
            </Card>
          )}

          {status === 'done' && result && (
            <Card className="p-5 space-y-4" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-[#4ade80]" />
                <span className="text-sm font-medium">Importación completada</span>
                <span className="text-xs text-muted-foreground ml-1">→ tabla <code className="text-xs">{result.table}</code></span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-bold text-[#4ade80]">{result.done}</p>
                  <p className="text-xs text-muted-foreground">Insertados</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#e24b4a]">{result.errors}</p>
                  <p className="text-xs text-muted-foreground">Errores</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-muted-foreground">{result.skipped}</p>
                  <p className="text-xs text-muted-foreground">Omitidos</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={reset} className="w-full" style={{ borderRadius: '8px' }}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Importar otro archivo
              </Button>
            </Card>
          )}
        </div>
      )}

      {status === 'error' && (
        <Card className="p-4 flex items-center gap-3 border-[#e24b4a]/30" style={{ borderRadius: '12px' }}>
          <AlertTriangle className="w-5 h-5 text-[#e24b4a] flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-[#e24b4a]">Error al leer el archivo</p>
            <p className="text-xs text-muted-foreground mt-0.5">Verifica que sea un .xlsx válido</p>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} style={{ borderRadius: '8px' }}>Reintentar</Button>
        </Card>
      )}
    </div>
  )
}
