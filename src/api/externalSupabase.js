import { createClient } from '@supabase/supabase-js'

const EXT_URL  = import.meta.env.VITE_SUPABASE_EXTERNA_URL
const EXT_KEY  = import.meta.env.VITE_SUPABASE_EXTERNA_ANON_KEY

// El cliente es null si las variables no están configuradas.
// La UI mostrará el estado "no configurado" en lugar de explotar.
export const supabaseExterna = (EXT_URL && EXT_KEY)
  ? createClient(EXT_URL, EXT_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

export const isExternaConfigured = Boolean(EXT_URL && EXT_KEY)
