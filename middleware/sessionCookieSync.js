/**
 * =============================================================
 *  Middleware: sessionCookieSync
 * =============================================================
 *  Descripción:
 *    - Sincroniza la cookie "userInfo" con la sesión para mantener el estado del usuario.
 *    - Restaura la sesión desde la cookie si no existe, y actualiza la cookie desde la sesión.
 *
 *  Funcionamiento:
 *    - Si existe cookie y no hay sesión, restaura datos de usuario en la sesión.
 *    - Si existe sesión, actualiza la cookie "userInfo" con los datos actuales.
 *    - Continúa con el siguiente middleware (next()).
 *
 *  Dependencias:
 *    - req.session, req.cookies, res.cookie
 *
 *  Notas de seguridad:
 *    - Manejo de errores y logs en español
 *    - Validación estricta de datos de usuario
 *    - Cookie "userInfo" no es httpOnly (accesible por scripts del cliente)
 */
// Sincroniza la cookie "userInfo" con la sesión para mantener el estado del usuario.
module.exports = (req, res, next) => {
  const cookie = req.cookies && req.cookies.userInfo;

  if (cookie && (!req.session || !req.session.user)) {
    try {
      const parsed = typeof cookie === 'string' ? JSON.parse(decodeURIComponent(cookie)) : cookie;
      if (parsed && (parsed.id || parsed.nombre)) {
        req.session = req.session || {};
        req.session.user = req.session.user || {};
        if (parsed.id && !req.session.user.id) req.session.user.id = parsed.id;
        if (parsed.nombre && !req.session.user.nombre) req.session.user.nombre = parsed.nombre;
        const parsedTipo = parsed.Tipo_Usu_ID;
        const parsedTipoNumeric = Number(parsedTipo);
        if (Number.isFinite(parsedTipoNumeric)) {
          req.session.user.Tipo_Usu_ID = parsedTipoNumeric;
        }
      }
    } catch (cookieErr) {
      console.warn('[session-cookie-sync] Falló al analizar la cookie userInfo:', cookieErr && cookieErr.message ? cookieErr.message : cookieErr);
    }
  }

  if (req.session && req.session.user) {
    const { id, nombre } = req.session.user;
    const tipoRaw = req.session.user.Tipo_Usu_ID;
    const payload = { nombre, id };
    const tipoNumeric = Number(tipoRaw);
    if (Number.isFinite(tipoNumeric)) {
      payload.Tipo_Usu_ID = tipoNumeric;
    }
    res.cookie('userInfo', JSON.stringify(payload), { httpOnly: false });
  }

  next();
};
