import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { validateImportFile, IMPORT_LIMITS, sanitizeText } from '@/lib/security';
import { importRowSchema } from '@/lib/validation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X, Check, AlertTriangle, Loader2 } from 'lucide-react';

const CAMPOS_ALMACEN = [
  { value: 'almacen',      label: 'Almacén' },
  { value: 'tienda',       label: 'Tienda' },
  { value: 'exist_fisica', label: 'Existencia Física' },
];

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines
    .slice(1, IMPORT_LIMITS.MAX_ROWS + 1) // Hard cap en parsing
    .map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    })
    .filter(row => Object.values(row).some(v => v));
}

export default function ImportarProductos({ productos, user, onClose, onImported }) {
  const [file, setFile]             = useState(null);
  const [rows, setRows]             = useState([]);
  const [headers, setHeaders]       = useState([]);
  const [colCodigo, setColCodigo]   = useState('');
  const [colCampo, setColCampo]     = useState('');
  const [campoDestino, setCampoDestino] = useState('almacen');
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState(null);
  const [fileError, setFileError]   = useState('');
  const inputRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;

    setFileError('');
    setResult(null);

    // ── Validación de archivo ──────────────────────────
    const validErr = validateImportFile(f);
    if (validErr) {
      setFileError(validErr);
      e.target.value = '';
      return;
    }

    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);

      if (parsed.length === 0) {
        setFileError('El archivo está vacío o no tiene el formato correcto.');
        setFile(null);
        e.target.value = '';
        return;
      }
      if (parsed.length > IMPORT_LIMITS.MAX_ROWS) {
        setFileError(`El archivo tiene más de ${IMPORT_LIMITS.MAX_ROWS.toLocaleString('es')} filas. Divide el archivo.`);
        setFile(null);
        e.target.value = '';
        return;
      }

      setRows(parsed);
      setHeaders(Object.keys(parsed[0]));
      setColCodigo('');
      setColCampo('');
    };
    reader.onerror = () => setFileError('No se pudo leer el archivo.');
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!colCodigo || !colCampo || !campoDestino || !rows.length) return;
    setLoading(true);
    let updated = 0, skipped = 0, duplicated = 0;

    const productosMap = {};
    productos.forEach(p => {
      if (p.codigo_producto) productosMap[p.codigo_producto.trim()] = p;
    });

    const ahora = new Date().toISOString();
    const codigosVistos = new Set();

    for (const row of rows) {
      const rawCodigo   = sanitizeText(row[colCodigo] || '', 200).trim();
      const rawCantidad = row[colCampo];
      const cantidad    = parseFloat(rawCantidad);

      // ── Validación de fila ─────────────────────────
      const rowCheck = importRowSchema.safeParse({ codigo: rawCodigo, cantidad });
      if (!rowCheck.success) { skipped++; continue; }

      // Código repetido dentro del mismo archivo: solo se aplica la primera
      // ocurrencia, evita varias escrituras contradictorias en el historial.
      if (codigosVistos.has(rowCheck.data.codigo)) { duplicated++; continue; }
      codigosVistos.add(rowCheck.data.codigo);

      const prod = productosMap[rowCheck.data.codigo];
      if (!prod) { skipped++; continue; }

      // Doble check: cantidad debe ser finita y dentro de límites
      if (!isFinite(cantidad) || cantidad < 0 || cantidad > IMPORT_LIMITS.MAX_QTY) {
        skipped++; continue;
      }

      await base44.entities.Producto.update(prod.id, {
        [campoDestino]: rowCheck.data.cantidad,
      });
      await base44.entities.HistorialMovimiento.create({
        producto_id:    prod.id,
        producto_nombre:prod.nombre,
        producto_codigo:prod.codigo_producto,
        usuario_id:     user?.email || '',
        usuario_nombre: user?.full_name || user?.email || '',
        tipo_cambio:    'importacion',
        campo:          campoDestino,
        valor_anterior: String(prod[campoDestino] ?? ''),
        valor_nuevo:    String(rowCheck.data.cantidad),
        fecha:          ahora,
        origen:         'importacion',
      });
      updated++;
    }

    setResult({ updated, skipped, duplicated });
    setLoading(false);
    onImported();
  };

  const ready = colCodigo && colCampo && campoDestino && rows.length > 0;

  return (
    <Card className="p-6 space-y-5" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Importar stock desde archivo</h3>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      {/* Límites info */}
      <div className="text-[11px] text-muted-foreground bg-secondary/50 px-3 py-2 rounded-md" style={{ borderRadius: '6px' }}>
        Límites: CSV · máx. 5 MB · máx. {IMPORT_LIMITS.MAX_ROWS.toLocaleString('es')} filas · cantidades 0–{IMPORT_LIMITS.MAX_QTY.toLocaleString('es')}
      </div>

      {/* Step 1: Upload */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">1. Sube un archivo CSV</p>
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent/30 transition-colors"
          style={{ borderRadius: '8px' }}
          onClick={() => inputRef.current.click()}
        >
          <Upload className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {file ? file.name : 'Haz clic para seleccionar un CSV'}
          </p>
          <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </div>

        {fileError && (
          <p className="text-xs text-[#E24B4A] mt-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {fileError}
          </p>
        )}
        {rows.length > 0 && !fileError && (
          <p className="text-xs text-muted-foreground mt-1">{rows.length} filas detectadas</p>
        )}
      </div>

      {/* Step 2: Map columns */}
      {headers.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">2. Mapea las columnas</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Columna de código</label>
              <Select value={colCodigo} onValueChange={setColCodigo}>
                <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Columna de cantidad</label>
              <Select value={colCampo} onValueChange={setColCampo}>
                <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Importar como</label>
              <Select value={campoDestino} onValueChange={setCampoDestino}>
                <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPOS_ALMACEN.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && colCodigo && colCampo && (
        <div className="border rounded-lg overflow-hidden" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="text-left p-2 text-muted-foreground">Código</th>
                <th className="text-right p-2 text-muted-foreground">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-2">{r[colCodigo]}</td>
                  <td className="p-2 text-right">{r[colCampo]}</td>
                </tr>
              ))}
              {rows.length > 5 && (
                <tr><td colSpan={2} className="p-2 text-center text-muted-foreground">... y {rows.length - 5} más</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="flex gap-3">
          <div className="flex items-center gap-1.5 text-xs text-[#1D9E75]">
            <Check className="w-3.5 h-3.5" /> {result.updated} actualizados
          </div>
          {result.skipped > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-[#BA7517]">
              <AlertTriangle className="w-3.5 h-3.5" /> {result.skipped} omitidos (código no encontrado o cantidad inválida)
            </div>
          )}
          {result.duplicated > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-[#BA7517]">
              <AlertTriangle className="w-3.5 h-3.5" /> {result.duplicated} filas con código repetido en el archivo (se usó solo la primera)
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} style={{ borderRadius: '8px' }}>Cerrar</Button>
        <Button onClick={handleImport} disabled={!ready || loading} style={{ borderRadius: '8px' }}>
          {loading
            ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Importando...</>
            : <><Upload className="w-4 h-4 mr-1.5" /> Importar</>}
        </Button>
      </div>
    </Card>
  );
}
