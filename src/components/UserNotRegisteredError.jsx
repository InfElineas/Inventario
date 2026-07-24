import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShieldAlert, RefreshCw } from 'lucide-react';

export default function UserNotRegisteredError() {
  const [checking, setChecking] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const handleRetry = async () => {
    setChecking(true);
    // Fuerza un re-check del perfil recargando la página manteniendo la sesión activa
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-8 space-y-5 text-center" style={{ borderRadius: '16px', borderWidth: '0.5px' }}>
        <div className="flex justify-center">
          <div className="p-3 rounded-full bg-[#BA7517]/10">
            <ShieldAlert className="w-6 h-6 text-[#BA7517]" />
          </div>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-base font-medium text-foreground">Pendiente de aprobación</h1>
          <p className="text-sm text-muted-foreground">
            Tu solicitud fue registrada. El administrador debe aprobarte antes de que puedas acceder.
          </p>
        </div>

        <div className="bg-secondary/50 rounded-lg p-4 text-left space-y-1.5" style={{ borderRadius: '8px' }}>
          <p className="text-xs font-medium text-foreground">Próximos pasos:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>1. Avisa al administrador que iniciaste sesión</li>
            <li>2. Espera a que apruebe tu cuenta y asigne tu rol</li>
            <li>3. Haz clic en <strong className="text-foreground">Ya me aprobaron</strong> para entrar</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            onClick={handleRetry}
            disabled={checking}
            style={{ borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none' }}
            className="w-full gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Verificando…' : 'Ya me aprobaron — Entrar'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            style={{ borderRadius: '8px' }}
            className="w-full"
          >
            Cerrar sesión e intentar con otra cuenta
          </Button>
        </div>
      </Card>
    </div>
  );
}
