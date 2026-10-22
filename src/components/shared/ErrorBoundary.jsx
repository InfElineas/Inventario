import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Contiene el fallo de una pantalla para que no se lleve por delante la
 * aplicación entera.
 *
 * Sin esto, cualquier excepción durante el render desmonta todo el árbol y
 * deja la ventana en blanco: ni menú, ni mensaje, ni forma de volver. El
 * usuario solo ve que «se rompió», y el motivo queda en una consola que nadie
 * mira. Pasó con un `ReferenceError` en el catálogo.
 *
 * Aquí el fallo queda acotado a la ruta: el resto de la aplicación sigue en
 * pie, se dice qué pasó y se ofrece reintentar.
 *
 * Tiene que ser una clase: los hooks no capturan errores de render.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Con el mensaje a secas no se puede diagnosticar nada: hace falta saber
    // qué componente lo lanzó.
    console.error('[error-boundary]', error, info?.componentStack);
  }

  reintentar = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 gap-3 text-center">
        <AlertTriangle className="w-9 h-9 text-[#e24b4a] opacity-80" />
        <p className="text-sm font-medium">Esta pantalla no se pudo mostrar</p>
        <p className="text-xs text-muted-foreground max-w-md">
          El resto del sistema sigue funcionando. Si vuelve a pasar, copia este
          mensaje y pásalo a soporte:
        </p>
        <code className="text-[11px] text-[#e24b4a] bg-[#e24b4a]/10 px-3 py-2 rounded-md max-w-xl break-all">
          {error.message || String(error)}
        </code>
        <Button variant="outline" size="sm" onClick={this.reintentar} style={{ borderRadius: '8px' }}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reintentar
        </Button>
      </div>
    );
  }
}
