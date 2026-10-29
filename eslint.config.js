import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  // Nada que linar en el build ni en los assets.
  { ignores: ["dist/**", "coverage/**", "node_modules/**"] },

  {
    // Todo `src/`, no tres carpetas sueltas. Antes App.jsx, main.jsx y
    // src/api quedaban fuera, y ahi vive el guard de rutas: un
    // `tieneRol is not defined` paso el lint y el build enteros y reventó
    // las pantallas de facturacion en produccion. Lo mismo habia pasado con
    // un `hoveredEnMapa is not defined` en el catalogo.
    files: ["src/**/*.{js,mjs,cjs,jsx}"],
    // Codigo generado por shadcn: se actualiza regenerandolo, no editandolo.
    ignores: ["src/components/ui/**/*"],

    languageOptions: {
      // Navegador y Node a la vez: en `src/` conviven el frontend y el
      // servidor (`src/server`, `src/services/tkc`). Separarlos en dos
      // bloques seria mas estricto, pero lo que se busca aqui es que ningun
      // fichero se quede sin linar, que es como pasó lo de arriba.
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    // Version fijada a proposito, NO "detect": con "detect",
    // eslint-plugin-react 7.37.5 revienta en ESLint 10 dentro de
    // detectReactVersion ("contextOrFilename.getFilename is not a function",
    // su util/version.js usa una API de contexto que ESLint 10 cambio).
    // Fijarla evita esa ruta de codigo por completo. Al subir React hay que
    // actualizar este numero a mano.
    settings: { react: { version: "19.2" } },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },

    // Antes esto eran dos spreads (...pluginJs.configs.recommended y
    // ...pluginReact.configs.flat.recommended) colocados ANTES de la clave
    // `rules`, que los pisaba entera: las dos recommended no llegaban a
    // aplicarse nunca. Ahora se mezclan explicitamente, que es lo que se
    // pretendia.
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...pluginReact.configs.flat.recommended.rules,

      "no-unused-vars": "off",
      // Usar un `const` antes de su línea no es un aviso de estilo: revienta
      // en tiempo de ejecución con «Cannot access X before initialization» y
      // deja la pantalla en blanco. Pasó dos veces en un mismo día al mover
      // bloques de sitio, y ni el lint ni el build decían nada.
      //
      // `functions: false` porque las declaraciones de función sí se izan y
      // el proyecto las usa así a propósito: los componentes auxiliares van
      // al final del archivo, después de quien los usa.
      "no-use-before-define": ["error", { functions: false, classes: true, variables: true }],
      // El proyecto usa `catch {}` a proposito para tragarse fallos de
      // localStorage y JSON.parse, que no deben tumbar la UI. Son 9 sitios y
      // todos son intencionados, asi que se permite el catch vacio en vez de
      // ensuciarlos con un comentario cada uno.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Solo estetica: se queja de las comillas en texto JSX
      // (The page "{pageName}" could not be found). Escaparlas empeora la
      // legibilidad de la prosa sin ganar nada.
      "react/no-unescaped-entities": "off",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": ["error", { ignore: ["toast-close"] }],

      "react-hooks/rules-of-hooks": "error",
      // Estaba sin activar, y sin embargo hay ficheros con
      // `eslint-disable react-hooks/exhaustive-deps`: esos disables producian
      // "Definition for rule not found" en cada `bun run lint`.
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  {
    // Las pruebas corren con `globals: true` (vite.config.js), asi que `vi`,
    // `describe` y compania existen sin importarlos.
    files: ["src/__tests__/**/*.{js,jsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
];
