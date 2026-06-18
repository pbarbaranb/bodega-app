# Mi Bodega

App mobile-first para gestión de bodega peruana — Vite + React + Tailwind + Supabase.

## Desarrollo local

```bash
npm install
npm run dev
```

Copia `.env` con tus variables (ver `.env.example` si existe) y agrega `VITE_ANTHROPIC_KEY` para Claude Vision.

## Deploy en Vercel

1. Repo privado en GitHub
2. Importar en Vercel (framework: Vite)
3. Variables de entorno: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ANTHROPIC_KEY`
4. Push a `main` → deploy automático

## Editar desde el celular

Abre el repo en GitHub y cambia `github.com` por `github.dev` para editar con VS Code en el navegador.
