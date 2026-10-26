import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pedirCredencialesTkc } from '@/lib/tkcCredenciales';

/**
 * El porqué de una función bloqueada por falta de credenciales de TKC.
 * `funcion` completa la frase: «… no se puede <funcion> sin …».
 */
export default function TkcBloqueoAviso({ funcion = 'usar esta función', className = '' }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border border-[#BA7517]/30 bg-[#BA751710] ${className}`}
    >
      <Lock className="w-4 h-4 text-[#BA7517] mt-0.5 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-medium text-[#BA7517]">Sin credenciales de TKC</p>
        <p className="text-muted-foreground mt-0.5">
          Para {funcion} se consulta TKC con tu usuario, y no tienes credenciales vigentes
          (nunca las ingresaste o ya pasaron sus 7 días). Ingrésalas una vez y no tendrás
          que repetirlo durante la semana.
        </p>
        <Button type="button" size="sm" className="mt-2" onClick={() => pedirCredencialesTkc()}>
          Ingresar credenciales de TKC
        </Button>
      </div>
    </div>
  );
}
