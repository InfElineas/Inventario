import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime:            5 * 60 * 1000,  // datos frescos por 5 min → no refetch en cada navegación
			gcTime:               30 * 60 * 1000, // mantiene en cache 30 min aunque no haya suscriptores
			refetchOnWindowFocus: false,
			retry:                1,
		},
	},
});