import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/api/supabaseClient'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTheme } from '@/lib/useTheme'
import { Sun, Moon, User, Settings2, ArrowRight } from 'lucide-react'

export default function ProfileModal({ user, open, onClose }) {
  const queryClient  = useQueryClient()
  const navigate     = useNavigate()
  const { isDark, toggleTheme } = useTheme()

  const [nickname, setNickname] = useState(user?.nickname || '')
  const [saved,    setSaved]    = useState(false)

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user?.email) return
      const { error } = await supabase
        .from('usuarios')
        .update({ nickname: nickname.trim() || null })
        .eq('email', user.email)
      if (error) throw error
    },
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      queryClient.invalidateQueries({ queryKey: ['currentUser'] })
    },
  })

  const displayName = user?.nickname || user?.full_name || user?.email?.split('@')[0] || 'Usuario'

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent
        className="max-w-sm w-full p-0 gap-0 overflow-hidden"
        style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
      >
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-base font-semibold">Perfil y configuración</DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">

          {/* Avatar + nombre */}
          <div className="flex items-center gap-3">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={displayName}
                className="w-14 h-14 rounded-full object-cover border-2 border-border" />
            ) : (
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[#4ade80]/20 border-2 border-[#4ade80]/30">
                <User className="w-6 h-6 text-[#4ade80]" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              <span className="inline-block mt-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{ background: '#4ade8022', color: '#4ade80' }}>
                {user?.role?.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Nickname */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nickname en la web</label>
            <input
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder={user?.full_name || 'Tu nombre en la app'}
              maxLength={30}
              className="w-full px-3 py-2 text-sm rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50"
            />
            <p className="text-[10px] text-muted-foreground">
              Se muestra en lugar de tu nombre de Google dentro de la app.
            </p>
          </div>

          {/* Link a Configuración */}
          <button
            type="button"
            onClick={() => { onClose(); navigate('/configuracion') }}
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-[#4ade80]/30 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              Almacenes y sincronización automática
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {/* Tema */}
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <p className="text-sm font-medium">Apariencia</p>
              <p className="text-xs text-muted-foreground">{isDark ? 'Modo oscuro' : 'Modo claro'}</p>
            </div>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-[#4ade80]/30 transition-colors"
            >
              {isDark ? <><Sun className="w-4 h-4" /> Claro</> : <><Moon className="w-4 h-4" /> Oscuro</>}
            </button>
          </div>

          {/* Guardar */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="flex-1 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              style={{ background: '#4ade80', color: '#000' }}
            >
              {saveMut.isPending ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Cerrar
            </button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
