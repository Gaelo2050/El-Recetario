/**
 * =============================================================
 *  Ruta de Páginas (pages.js)
 * =============================================================
 *  Descripción:
 *    - Define las rutas para servir las vistas HTML principales del sitio web.
 *    - Incluye rutas públicas y protegidas para acceso a páginas de usuario, administración y comunidad.
 *    - Utiliza middlewares para restringir acceso a páginas sensibles (autenticación y administración).
 *
 *  Rutas principales:
*    - GET /, /inicio, /registro, /iniciar-sesion, /Error, /recuperar-contrasena, /confirmar-correo, /categorias, /buscar, /buscar-usuarios, /terminos, /privacidad, /contacto, /cancelar
*    - GET /crear-receta, /recetas-guardadas, /perfil, /perfil/:alias, /siguiendo, /suscripcion, /logros, /configuracion, /amigos, /estadisticas, /cambiar-contrasena, /comunidad (requiere autenticación según corresponda)
*    - GET /administracion, /administracion/usuarios/:userId, /administracion/recetas/:recipeId (requiere autenticación y permisos de administrador)
 *
 *  Dependencias:
 *    - express (framework de rutas)
 *    - path (gestión de rutas de archivos)
 *    - ensureAuthenticated, ensureAdmin (middleware de seguridad)
 *
 *  Notas de seguridad:
 *    - Acceso restringido a páginas sensibles mediante middlewares
*    - Redirección automática si el usuario ya está autenticado en /iniciar-sesion
 */
const express = require('express');
const path = require('path');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const ensureAdmin = require('../middleware/ensureAdmin');
const recipesModel = require('../models/recipesModel');
const serveView = (view) => (req, res) => res.sendFile(resolveView(view));

const router = express.Router();
const resolveView = (view) => path.join(__dirname, '..', 'views', view);

router.get('/', (req, res) => res.sendFile(resolveView('index.html')));
router.get('/registro', (req, res) => res.sendFile(resolveView('register.html')));
router.get('/iniciar-sesion', (req, res) => {
  if (req.session && req.session.user && req.session.user.id) {
    return res.redirect('/');
  }
  const cookie = req.headers && req.headers.cookie;
  if (cookie && /userInfo=/.test(cookie)) {
    return res.redirect('/');
  }
  return res.sendFile(resolveView('login.html'));
});
router.get('/error', (req, res) => res.sendFile(resolveView('Error.html')));
router.get('/inicio', (req, res) => res.sendFile(resolveView('index.html')));
router.get('/recuperar-contrasena', (req, res) => res.sendFile(resolveView('forgot-password.html')));
router.get('/confirmar-correo', (req, res) => res.sendFile(resolveView('confirm_email.html')));
router.get('/crear-receta', ensureAuthenticated, (req, res) => res.sendFile(resolveView('create-recipe.html')));
router.get('/categorias', (req, res) => res.sendFile(resolveView('categories.html')));
router.get('/buscar', (req, res) => {
  const hasQuery = typeof req.originalUrl === 'string' && req.originalUrl.includes('?');
  const query = hasQuery ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  return res.redirect(302, `/recetas${query}`);
});
router.get('/buscar-usuarios', (req, res) => res.sendFile(resolveView('user-search.html')));
router.get('/recetas-guardadas', ensureAuthenticated, (req, res) => res.sendFile(resolveView('saved-recipes.html')));
router.get('/perfil', ensureAuthenticated, (req, res) => res.sendFile(resolveView('profile.html')));
router.get('/perfil/:alias', (req, res) => res.sendFile(resolveView('friends.html')));
router.get('/siguiendo', ensureAuthenticated, (req, res) => res.sendFile(resolveView('following.html')));
router.get('/mis-recetas', ensureAuthenticated, (req, res) => res.sendFile(resolveView('myrecipes.html')));
router.get('/suscripcion', ensureAuthenticated, (req, res) => res.sendFile(resolveView('subscription.html')));
router.get('/logros', ensureAuthenticated, (req, res) => res.sendFile(resolveView('achievements.html')));
router.get('/configuracion', ensureAuthenticated, (req, res) => res.sendFile(resolveView('settings.html')));
router.get('/amigos', ensureAuthenticated, (req, res) => res.sendFile(resolveView('friends.html')));
router.get('/estadisticas', ensureAuthenticated, (req, res) => res.sendFile(resolveView('stats.html')));
router.get('/cambiar-contrasena', ensureAuthenticated, (req, res) => res.sendFile(resolveView('change-password.html')));
router.get('/comunidad', ensureAuthenticated, (req, res) => res.sendFile(resolveView('community.html')));
router.get('/administracion', ensureAuthenticated, ensureAdmin, serveView('admin.html'));
router.get('/administracion/usuarios/:userId', ensureAuthenticated, ensureAdmin, (req, res) => res.sendFile(resolveView('admin-user-detail.html')));
router.get('/administracion/recetas/:recipeId', ensureAuthenticated, ensureAdmin, (req, res) => res.sendFile(resolveView('admin-recipe-detail.html')));
router.get('/administracion/comentarios/:commentId', ensureAuthenticated, ensureAdmin, (req, res) => res.sendFile(resolveView('user-comment-detail.html')));
router.get('/administracion/reportes/:reportId', ensureAuthenticated, ensureAdmin, (req, res) => res.sendFile(resolveView('user-report-detail.html')));
router.get('/administracion/categorias', ensureAuthenticated, ensureAdmin, serveView('admin-categories.html'));
router.get('/perfil/recetas/:recipeId', ensureAuthenticated, async (req, res, next) => {
  try {
    const recipeId = Number(req.params.recipeId);
    const userId = req.session && req.session.user ? req.session.user.id : null;

    if (!Number.isFinite(recipeId) || recipeId <= 0 || !userId) {
      return res.status(404).sendFile(resolveView('error.html'));
    }

    const recipe = await recipesModel.obtenerRecetaEditablePorUsuario({ recipeId, userId });
    if (!recipe) {
      return res.status(404).sendFile(resolveView('error.html'));
    }

    return res.sendFile(resolveView('user-recipe-detail.html'));
  } catch (error) {
    return next(error);
  }
});
router.get('/terminos', serveView('terms.html'));
router.get('/privacidad', serveView('privacy.html'));
router.get('/contacto', serveView('contact.html'));
router.get('/cancelar', serveView('cancel.html'));

module.exports = router;
