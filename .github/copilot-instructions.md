# Copilot Instructions

## Big Picture
- `server.js` boots an Express 5 app, wires middlewares (static assets, sessions, cookies) and mounts routers from `routes/` for auth, recipes, payments, admin, and public pages; every new endpoint should be registered through these routers instead of editing `server.js` directly.
- Business logic lives in `controllers/` and is split by domain (`recipesController`, `authController`, `communityController`, etc.); controllers always delegate database access to the matching `models/*` helpers and return JSON with `{ ok, error }` fields plus localized (Spanish) messages.
- Data access is centralized in `models/` using the mysql2 promise pool from `config/db.js`; prefer the exported helpers (e.g., `consultar`, `obtenerConexion`, `insertarReceta`, `insertarIngredienteConConexion`) so transactions and parameterized queries stay consistent.
- Static UI under `views/` (HTML + vanilla JS) and `public/` (compiled Tailwind CSS + JS utilities) consumes the Express JSON APIs; most admin screens use `fetch` with `credentials: 'include'`, so keep session-required routes behind middleware like `ensureAuthenticated`/`ensureAdmin`.

## Environment & Workflows
- Install dependencies with `npm install`, start the API with `npm run dev` (nodemon) or `npm start` in production; Tailwind is already compiled into `public/css/output.css` so you rarely need a build step.
- Copy `.env` and supply `PORT`, `BD_*` (MariaDB), Firebase (`FIREBASE_*` plus service account JSON), and Stripe (`STRIPE_*`) values before running; the DB schema and seed data are defined in `sql/Base de datos.sql`.
- The filesystem stores recipe/category images under `Imagenes/Recetas` and `Imagenes/Categorias`; use `utils/recipeImageStorage.saveRecipeImageFromDataUrl` (max 5 images, 5 MB, enforced extensions) for every DataURL upload and never write directly with `fs` elsewhere.

## Conventions & Patterns
- Controllers validate input aggressively and return early with 4xx codes plus Spanish error keys (`errorMessages` in `recipesController`); mirror this style for new handlers.
- Transactions: when a change spans multiple tables (e.g., recipe + ingredients + utensils) acquire a connection via `authModel.obtenerConexion()` / `recipesModel.obtenerConexion()`, call `beginTransaction()`, and ensure `commit/rollback` + `connection.release()` in `finally` blocks (see `controllers/authController.js` → PUT `/api/administracion/recetas/:id`).
- Ingredient/utensil catalogs dedupe entries by normalized names; reuse helpers like `buscarIngredientePorNombre`, `insertarIngredienteConConexion`, and keep unit strings ≤100 chars to satisfy DB limits.
- Response payloads for recipes always include `images`, `utensils`, `ingredients`, plus derived arrays (`ingredientNames`, `utensilNames`); update both controller serialization and front-end expectations (`views/admin-recipe-detail.html`) together when shape changes.
- Keep localized UI text and notifications in Spanish (e.g., `showToast('Categoría eliminada.')`); if you add new statuses, follow the same tone and place strings near existing ones.

## Debugging Tips
- Session state is synchronized between cookies and server via `middleware/sessionCookieSync`; if an endpoint expects `req.session.user`, ensure your tests set the `userInfo` cookie or call `ensureAuthenticated` first.
- When image uploads fail, `recipeImageStorage` throws explicit codes (`image_too_large`, `too_many_images`, `image_path_too_long`); catch and translate them before responding to keep the admin UI toast logic working.
- For analytics or counts, prefer the existing aggregate queries inside `recipesModel` (e.g., `obtenerResumenCalificacionesReceta`, `obtenerRecetasRelacionadasPorCategoria`) instead of duplicating SQL.
- New DB fields should also be reflected in the seed script `sql/Base de datos.sql` so contributors can hydrate local instances quickly.

Let us know if any of these sections feel unclear so we can expand them for the team.