import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const formatearExpira = (ms) =>
  new Date(ms).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Las credenciales de TKC de la persona, en Configuración. Se escriben una vez,
 * el servidor las comprueba con TKC y duran 7 días; la contraseña no vuelve
 * nunca al navegador (solo `tiene_tkc` y `tkc_expira`).
 */
export default function TkcCredencialesForm() {
  const { user, refrescarSesion } = useAuth();
  const [editando, setEditando] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // Todo cambio pasa por aquí: ocupa el formulario, muestra el error y refresca el perfil.
  const ejecutar = async (accion) => {
    setOcupado(true);
    setError('');
    try {
      await accion();
      await refrescarSesion();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (await ejecutar(() => base44.auth.guardarTkc({ username, password }))) {
      setEditando(false);
      setUsername('');
      setPassword('');
    }
  };

  if (user?.tiene_tkc && !editando) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-foreground">
          Credenciales guardadas
          {user.tkc_expira && <> hasta el <strong>{formatearExpira(user.tkc_expira)}</strong></>}.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditando(true)}>
            Cambiar
          </Button>
          <Button
            type="button" variant="outline" size="sm" disabled={ocupado}
            onClick={() => ejecutar(() => base44.auth.olvidarTkc())}
          >
            Olvidar
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={Boolean(user.tkc_olvidar_al_salir)}
            disabled={ocupado}
            onChange={(e) => ejecutar(() => base44.auth.olvidarTkcAlSalir(e.target.checked))}
          />
          Olvidarlas al cerrar sesión
        </label>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="space-y-2.5 max-w-sm">
      <p className="text-xs text-muted-foreground">
        Se comprueban con TKC y se guardan cifradas durante 7 días. Solo las usa el
        servidor, a tu nombre.
      </p>
      <Input
        autoComplete="username" placeholder="Usuario de TKC" aria-label="Usuario de TKC"
        value={username} onChange={(e) => setUsername(e.target.value)} disabled={ocupado}
      />
      <Input
        type="password" autoComplete="current-password"
        placeholder="Contraseña de TKC" aria-label="Contraseña de TKC"
        value={password} onChange={(e) => setPassword(e.target.value)} disabled={ocupado}
      />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={ocupado || !username.trim() || !password}>
          {ocupado && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
          Guardar
        </Button>
        {editando && (
          <Button type="button" variant="ghost" size="sm" disabled={ocupado} onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
