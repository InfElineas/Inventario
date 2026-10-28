import { QueryClient } from '@tanstack/react-query';

/**
 * Cómo se mantiene al día lo que se ve en pantalla.
 *
 * El sistema lo usan varias personas a la vez sobre los mismos datos: quien
 * cuenta, quien factura, quien mueve mercancía. Antes la pantalla se quedaba
 * con lo que leyó al entrar —cinco minutos de margen y ningún refresco al
 * volver a la pestaña—, así que para ver lo que acababa de hacer otro, o lo
 * que uno mismo había hecho en otra pantalla, había que recargar.
 *
 * Tres cosas lo arreglan: poco margen de frescura, releer al volver a la
 * pestaña y una consulta periódica mientras la pestaña está a la vista. Una
 * pestaña olvidada en segundo plano no consulta nada.
 */
export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime:            30 * 1000,      // margen corto: casi todo se relee al navegar
			gcTime:               30 * 60 * 1000, // mantiene en cache 30 min aunque no haya suscriptores
			refetchOnWindowFocus: true,
			refetchInterval:            60 * 1000,
			refetchIntervalInBackground: false,
			retry:                1,
		},
	},
});

/**
 * Para las consultas que salen a TKC a través de la API de transferencias.
 *
 * Esas no se vigilan solas: TKC limita las peticiones por cuenta, y repetir
 * cada minuto un listado que casi nunca cambia gasta ese límite en nada. Se
 * releen al entrar, al tocar «Actualizar» y después de escribir.
 */
export const SIN_SONDEO = {
	refetchInterval: false,
	refetchOnWindowFocus: false,
};
