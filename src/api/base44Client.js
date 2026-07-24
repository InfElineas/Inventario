import { supabase } from './supabaseClient';
import { sanitizeError } from '@/lib/security';

// ── Mapeo entidad → tabla ─────────────────────────────────
const TABLE = {
  Producto:            'productos',
  AnuncioDesact:       'anuncios_desact',
  Merma:               'mermas',
  // Lote se lee desde la vista lotes_vigencia, que recalcula estado_fv/
  // vigencia_dias contra la fecha actual (ver migration_v29). Nada en el
  // código crea/actualiza Lote directamente, así que apuntar la entidad
  // completa a la vista es seguro.
  Lote:                'lotes_vigencia',
  LoteIC:              'lotes_ic',
  Inventario:          'inventarios',
  Recepcion:           'recepciones',
  Notificacion:        'notificaciones',
  HistorialMovimiento: 'historial_movimientos',
};

// ── Columnas permitidas en orderBy (whitelist anti-injection) ─
const ALLOWED_ORDER_COLUMNS = new Set([
  'created_date', 'updated_date', 'fecha', 'fecha_inv',
  'fecha_vencimiento', 'fecha_deteccion', 'nombre', 'producto_nombre',
  'estado_tarea', 'estado_fv', 'estado_anuncio', 'cantidad',
  'total_perdida', 'exist_fisica', 'precio', 'precio_costo',
  'no_recepcion', 'no_lote', 'tipo_caso', 'tipo_cambio',
]);

function parseOrder(str) {
  if (!str) return { column: 'created_date', ascending: false };
  const asc    = !str.startsWith('-');
  const column = asc ? str : str.slice(1);
  if (!ALLOWED_ORDER_COLUMNS.has(column)) {
    // Columna desconocida → fallback seguro, NO lanzar excepción
    return { column: 'created_date', ascending: false };
  }
  return { column, ascending: asc };
}

function entity(table) {
  return {
    list: async (orderBy, limit) => {
      const { column, ascending } = parseOrder(orderBy);
      let q = supabase.from(table).select('*').order(column, { ascending });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw new Error(sanitizeError(error));
      return data ?? [];
    },

    filter: async (conditions, orderBy, limit) => {
      const { column, ascending } = parseOrder(orderBy);
      let q = supabase.from(table).select('*').order(column, { ascending });
      Object.entries(conditions).forEach(([k, v]) => { q = q.eq(k, v); });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw new Error(sanitizeError(error));
      return data ?? [];
    },

    create: async (data) => {
      const { data: row, error } = await supabase.from(table).insert(data).select().single();
      if (error) throw new Error(sanitizeError(error));
      return row;
    },

    update: async (id, data) => {
      const { data: row, error } = await supabase.from(table).update(data).eq('id', id).select().single();
      if (error) throw new Error(sanitizeError(error));
      return row;
    },

    delete: async (id) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw new Error(sanitizeError(error));
    },
  };
}

export const base44 = {
  entities: new Proxy({}, {
    get(_, name) {
      const table = TABLE[name];
      if (!table) throw new Error(`Entidad no mapeada: ${name}`);
      return entity(table);
    },
  }),

  auth: {
    me: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: perfil } = await supabase
        .from('usuarios')
        .select('full_name, role')
        .eq('email', user.email)
        .single();
      return {
        id:        user.id,
        email:     user.email,
        full_name: perfil?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || '',
        role:      perfil?.role || 'inv',
      };
    },
    logout:          () => supabase.auth.signOut(),
    redirectToLogin: () => { window.location.href = '/login'; },
  },
};
