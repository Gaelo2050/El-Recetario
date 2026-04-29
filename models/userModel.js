/**
 * =============================================================
 *  Modelo de Usuario (userModel)
 * =============================================================
 *  Descripción:
 *    - Gestiona la lógica de acceso y manipulación de usuarios en la base de datos.
 *    - Proporciona funciones para consulta, actualización, eliminación, seguimiento y manejo de avatares.
 *    - Incluye utilidades para extracción de email, gestión de Stripe, y conteo de seguidores.
 *
 *  Funciones principales:
 *    - buscarPorId(), buscarPorIdentificador(), obtenerCorreoPorId()
 *    - actualizarIdClienteStripe(), ascenderASuscriptor(), obtenerFotoPorId()
 *    - eliminarUsuarioPorId(), seguirUsuario(), dejarDeSeguirUsuario(), obtenerConteoSeguidores()
 *    - eliminarAvatarUsuario()
 *
 *  Dependencias:
 *    - pool (conexión a base de datos)
 *    - fs, path (gestión de archivos y rutas)
 *
 *  Notas de seguridad:
 *    - Validación de parámetros antes de operaciones
 *    - Manejo de errores y logs
 *    - Uso de parámetros en queries para evitar inyecciones SQL
 *    - Eliminación segura de archivos de avatar
 */
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');

const EMAIL_FIELD_REGEX = /email|correo|mail/i;

const extractEmailFromRow = (row) => {
  if (!row) return null;
  for (const key of Object.keys(row)) {
    if (EMAIL_FIELD_REGEX.test(key)) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }
  return null;
};

async function buscarPorId(userId) {
  if (!userId) return null;
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE Usu_ID = ? LIMIT 1', [userId]);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function buscarPorIdentificador(identifier) {
  if (!identifier) return null;
  const cleaned = String(identifier).trim();
  if (!cleaned) return null;

  const numericMatch = cleaned.match(/^\d+$/);
  let sql;
  let params;

  if (numericMatch) {
    sql = 'SELECT Usu_ID, Usu_Nombre, Usu_Alias, Usu_Biografia, Usu_Foto, Usu_Fecha_Registro, Tipo_Usu_ID FROM usuarios WHERE Usu_ID = ? LIMIT 1';
    params = [Number(cleaned)];
  } else {
    const alias = cleaned.replace(/^@+/, '');
    sql = 'SELECT Usu_ID, Usu_Nombre, Usu_Alias, Usu_Biografia, Usu_Foto, Usu_Fecha_Registro, Tipo_Usu_ID FROM usuarios WHERE LOWER(Usu_Alias) = LOWER(?) LIMIT 1';
    params = [alias];
  }

  const [rows] = await pool.query(sql, params);
  if (!rows || !rows.length) return null;
  return rows[0];
}

async function obtenerCorreoPorId(userId) {
  const row = await buscarPorId(userId);
  return extractEmailFromRow(row);
}

let stripeColumnAvailable = true;

async function actualizarIdClienteStripe(userId, customerId) {
  if (!userId || !customerId || !stripeColumnAvailable) return;
  try {
    await pool.query('UPDATE usuarios SET stripe_customer_id = ? WHERE Usu_ID = ?', [customerId, userId]);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (error && error.code === 'ER_BAD_FIELD_ERROR') {
      stripeColumnAvailable = false;
      console.warn('[userModel] No hay columna stripe_customer_id en la tabla usuarios; omitiendo persistencia.');
      return;
    }
    console.warn('[userModel] Falló al persistir el ID de cliente de Stripe:', message);
  }
}

async function ascenderASuscriptor(userId) {
  if (!userId) return;
  await pool.query('UPDATE usuarios SET Tipo_Usu_ID = ? WHERE Usu_ID = ?', [3, userId]);
}

async function obtenerFotoPorId(userId) {
  if (!userId) return null;
  const [rows] = await pool.query('SELECT Usu_Foto FROM usuarios WHERE Usu_ID = ? LIMIT 1', [userId]);
  if (!rows || !rows.length) return null;
  return rows[0].Usu_Foto || null;
}

async function eliminarUsuarioPorId(userId) {
  if (!userId) return false;
  const [result] = await pool.query('DELETE FROM usuarios WHERE Usu_ID = ?', [userId]);
  return Boolean(result && result.affectedRows > 0);
}

async function desactivarUsuarioPorId(userId) {
  if (!userId) return false;
  const [result] = await pool.query('UPDATE usuarios SET Usu_Activo = 0 WHERE Usu_ID = ?', [userId]);
  return Boolean(result && result.affectedRows > 0);
}

async function seguirUsuario(followerId, targetId) {
  if (!followerId || !targetId) return;
  await pool.query(
    'INSERT INTO usuarios_seguidores (Seguidor_ID, Seguido_ID) VALUES (?, ?) ON DUPLICATE KEY UPDATE Fecha_Seguimiento = CURRENT_TIMESTAMP',
    [followerId, targetId]
  );
}

async function dejarDeSeguirUsuario(followerId, targetId) {
  if (!followerId || !targetId) return;
  await pool.query('DELETE FROM usuarios_seguidores WHERE Seguidor_ID = ? AND Seguido_ID = ?', [followerId, targetId]);
}

async function obtenerConteoSeguidores(userId) {
  if (!userId) return 0;
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM usuarios_seguidores WHERE Seguido_ID = ?', [userId]);
  return Number(rows && rows[0] && rows[0].total) || 0;
}

const projectRoot = path.join(__dirname, '..');

async function eliminarAvatarUsuario(rawPath) {
  if (!rawPath) return;
  const trimmed = String(rawPath).trim();
  if (!trimmed) return;
  const fullPath = trimmed.startsWith('/')
    ? path.join(projectRoot, trimmed.replace(/^\/+/, ''))
    : path.join(projectRoot, trimmed);
  try {
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  } catch (error) {
    console.error('[userModel] Falló al eliminar el avatar:', error && error.message ? error.message : error);
  }
}

module.exports = {
  buscarPorId,
  buscarPorIdentificador,
  obtenerCorreoPorId,
  actualizarIdClienteStripe,
  ascenderASuscriptor,
  obtenerFotoPorId,
  eliminarUsuarioPorId,
  desactivarUsuarioPorId,
  seguirUsuario,
  dejarDeSeguirUsuario,
  obtenerConteoSeguidores,
  eliminarAvatarUsuario,
};
