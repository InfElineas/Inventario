**Welcome to your Base44 project** 

**About**

View and Edit  your app on [Base44.com](http://Base44.com) 

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

Any change pushed to the repo will also be reflected in the Base44 Builder.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=your_backend_url

e.g.
VITE_BASE44_APP_ID=cbef744a8545c389ef439ea6
VITE_BASE44_APP_BASE_URL=https://my-to-do-list-81bfaad7.base44.app
```

Run the app: `npm run dev`

## Docker

Copia `.env.example` a `.env` y rellena las variables antes de construir: las
`VITE_*` se incrustan en el bundle al construir la imagen de producción, y las
`TKC_*` las lee el servidor en runtime.

**Desarrollo** — Vite dev server con HMR, `http://localhost:5173`:

```bash
docker compose -f docker-compose.dev.yml up --build
```

El código se monta desde el host, así que los cambios recargan en caliente sin
reconstruir. La API de TKC (`/api/tkc/*`) la sirve `vite-plugin-tkc.js` dentro
del propio proceso de Vite.

**Producción** — build estático + `server/index.js` en el puerto **3003**:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Imagen en dos etapas: Vite construye `dist/`, y la etapa final solo lleva Node,
el build y el servidor (sin `node_modules`: ese código usa únicamente módulos
nativos de Node). Tras cambiar una `VITE_*` en el `.env` hay que **reconstruir**
—no basta reiniciar—, porque su valor viaja dentro del bundle.

Cada compose usa su propio nombre de proyecto (`inventario-dev` /
`inventario-prod`), así que ambos pueden correr a la vez sin pisarse.

**Publish your changes**

Open [Base44.com](http://Base44.com) and click on Publish.

**Docs & Support**

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)
