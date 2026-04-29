/**
 * =============================================================
 *  Middleware: ensureAdmin
 * =============================================================
 *  Descripción:
 *    - Restringe el acceso a rutas solo para usuarios administradores (Tipo_Usu_ID = 1).
 *    - Verifica el tipo de usuario en la sesión y, si es necesario, consulta la base de datos.
 *    - Redirige a /iniciar-sesion si no hay sesión, o a / si el usuario no es administrador.
 *
 *  Funcionamiento:
 *    - Si el usuario es administrador, permite continuar (next()).
 *    - Si no, redirige a la página principal o de login.
 *    - Actualiza el tipo de usuario en la sesión si se consulta en la BD.
 *
 *  Dependencias:
 *    - pool (conexión a base de datos)
 *
 *  Notas de seguridad:
 *    - Manejo de errores y logs en español
 *    - Validación estricta de sesión y tipo de usuario
 */
// Middleware que restringe el acceso a usuarios administradores (Tipo_Usu_ID = 1).
const pool = require('../config/db');

module.exports = async function ensureAdmin(req, res, next) {
  try {
    if (!req.session || !req.session.user) {
      return res.redirect('/iniciar-sesion');
    }

    let tipoId = Number(req.session.user.Tipo_Usu_ID);
    if (tipoId === 1) return next();

    const userId = req.session.user.id;
    if (!userId) {
      return res.redirect('/');
    }

    const [rows] = await pool.query('SELECT Tipo_Usu_ID FROM usuarios WHERE Usu_ID = ? LIMIT 1', [userId]);
    if (rows && rows[0]) {
      tipoId = Number(rows[0].Tipo_Usu_ID);
      req.session.user.Tipo_Usu_ID = tipoId;
    }

    if (tipoId === 1) return next();

    return res.redirect('/');
  } catch (err) {
    console.error('ensureAdmin error:', err && err.message ? err.message : err);
    return res.status(500).send('Error interno al validar permisos');
  }
};
