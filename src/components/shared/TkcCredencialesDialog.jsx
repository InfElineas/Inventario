import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { suscribirPeticionTkc, resolverPeticionTkc } from '@/lib/tkcCredenciales';

/**
 * Pide el usuario y la contraseña de TKC cuando una acción lo necesita.
 *
 * Se monta una sola vez; lo abre `pedirCredencialesTkc()`. El servidor las prueba
 * contra TKC antes de sellarlas en la cookie, así que aquí un «Guardar» correcto
 * significa que ya funcionan.
 */
export default function TkcCredencialesDialog() {
  const { refrescarSesion } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => suscribirPeticionTkc(setAbierto), []);

  useEffect(() => {
    if (!abierto) { setPassword(''); setError(''); setEnviando(false); }
  }, [abierto]);

  const cancelar = () => { if (!enviando) resolverPeticionTkc(false); };

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await base44.auth.guardarTkc({ username, password });
      await refrescarSesion();
      resolverPeticionTkc(true);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v) cancelar(); }}>
      <DialogContent>
        <form onSubmit={guardar} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Ingresa tus credenciales de TKC</DialogTitle>
            <DialogDescription>
              Esta acción consulta TKC con tu cuenta. Se comprueban con TKC y se guardan
              cifradas durante 7 días, así que no tendrás que repetirlo. Puedes cambiarlas
              u olvidarlas en Configuración.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            autoComplete="username"
            placeholder="Usuario de TKC"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={enviando}
          />
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Contraseña de TKC"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={enviando}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancelar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando || !username.trim() || !password}>
              {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
