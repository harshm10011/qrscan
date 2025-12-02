# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Deploying to Vercel

Follow these steps to deploy this Vite app to Vercel (recommended for static sites):

1. Create an account at https://vercel.com/ and connect it to your GitHub account.
2. Import the repository `harshm10011/qrscan` into Vercel:
	- Select your project and choose the `card-scanner` folder (if your repository root contains multiple projects).
	- Framework Preset: Vite (or "Other" and set build command below)
	- Build Command: `npm run build`
	- Output Directory: `dist`
3. Set environment variables in your Vercel project settings:
	- `VITE_GEMINI_API_KEY` - your Gemini API key
	- `VITE_SHEET_WEBHOOK` - your Google Apps Script webhook URL
	These will be available to the app via `import.meta.env.VITE_GEMINI_API_KEY` and `import.meta.env.VITE_SHEET_WEBHOOK`.
4. (Optional) If you prefer to use the CLI, you can run:
	```bash
	npm i -g vercel
	vercel login
	vercel --prod
	```

Notes:
- We added `vercel.json` to configure the build to use `@vercel/static-build` and to route all paths to `index.html` for SPA behavior.
- Avoid committing secret values into the source; use environment variables in Vercel instead.
