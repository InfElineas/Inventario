import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AccessDenied() {
  return (
    <div className="flex items-center justify-center py-24">
      <Card className="w-full max-w-sm p-8 text-center space-y-4" style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }}>
        <div className="flex justify-center">
          <div className="p-3 rounded-full bg-[var(--c-bad)]/10">
            <ShieldOff className="w-5 h-5 text-[var(--c-bad)]" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Sin acceso</p>
          <p className="text-xs text-muted-foreground">Tu rol no tiene permiso para ver esta sección.</p>
        </div>
        <Button asChild variant="outline" size="sm" style={{ borderRadius: 'var(--r-ctl)' }}>
          <Link to="/">Volver al inicio</Link>
        </Button>
      </Card>
    </div>
  );
}
