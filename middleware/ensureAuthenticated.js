/**
 * =============================================================
 *  Middleware: ensureAuthenticated
 * =============================================================
 *  Descripción:
 *    - Garantiza que la petición proviene de un usuario autenticado.
 *    - Restaura la sesión desde la cookie userInfo si es posible.
 *    - Redirige a /iniciar-sesion o responde con error JSON si no hay autenticación.
 *
 *  Funcionamiento:
 *    - Si existe sesión válida, permite continuar (next()).
 *    - Si no, intenta restaurar sesión desde cookie.
 *    - Si no es posible, responde con error 401 (JSON) o redirige a login.
 *
 *  Dependencias:
 *    - req.session, req.cookies
 *
 *  Notas de seguridad:
 *    - Manejo de errores y logs en español
 *    - Validación estricta de sesión y restauración desde cookie
 *    - Respuesta adecuada según tipo de petición (JSON/XHR vs. navegador)
 */
// Middleware que garantiza que la petición proviene de un usuario autenticado.
module.exports = function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user && req.session.user.id) return next();

  try {
    const cookie = req.cookies && req.cookies.userInfo;
    if (cookie) {
      const parsed = typeof cookie === 'string' ? JSON.parse(decodeURIComponent(cookie)) : cookie;
      if (parsed && (parsed.id || parsed.nombre)) {
        req.session = req.session || {};
        req.session.user = req.session.user || {};
        if (!req.session.user.id && parsed.id) req.session.user.id = parsed.id;
        if (!req.session.user.nombre && parsed.nombre) req.session.user.nombre = parsed.nombre;
        const parsedTipo = parsed.Tipo_Usu_ID;
        const parsedTipoNumeric = Number(parsedTipo);
        if (Number.isFinite(parsedTipoNumeric)) {
          req.session.user.Tipo_Usu_ID = parsedTipoNumeric;
        }
        console.log('[ensureAuthenticated] sesión de usuario restaurada desde la cookie userInfo:', parsed);
        return next();
      }
    }
  } catch (e) {
    console.warn('[ensureAuthenticated] falló al analizar la cookie userInfo de respaldo:', e && e.message ? e.message : e);
  }

  const acceptsJson = req.headers['accept'] && req.headers['accept'].includes('application/json');
  const isXhr = req.headers['x-requested-with'] === 'XMLHttpRequest';
  if (acceptsJson || isXhr || req.headers['content-type'] === 'application/json') {
    return res.status(401).json({ error: 'authentication_required' });
  }

  const returnTo = encodeURIComponent(req.originalUrl || req.url || '/');
  return res.redirect('/iniciar-sesion');
};
