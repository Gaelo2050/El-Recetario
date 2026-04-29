/**
 * =============================================================
 *  Modelo de Autenticación (authModel)
 * =============================================================
 *  Alcance reducido:
 *    - Funciones necesarias para autenticación y sincronización con Firebase.
 *    - Operaciones básicas sobre usuarios (consulta, inserción, actualización).
 */
const pool = require('../config/db');

const consultar = (sql, params = []) => pool.query(sql, params);

const buscarUsuarioIdPorAlias = async (alias) => {
  const sql = 'SELECT Usu_ID FROM usuarios WHERE LOWER(Usu_Alias) = LOWER(?) LIMIT 1';
  const [rows] = await consultar(sql, [alias]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerMaximoUsuarioId = async () => {
  const sql = 'SELECT MAX(Usu_ID) as maxId FROM usuarios';
  const [rows] = await consultar(sql);
  if (rows && rows.length > 0 && rows[0] && typeof rows[0].maxId !== 'undefined') {
    return Number(rows[0].maxId) || 0;
  }
  return 0;
};

const insertarUsuario = async (columnNames, values) => {
  if (!Array.isArray(columnNames) || !Array.isArray(values) || columnNames.length !== values.length) {
    throw new Error('insertarUsuario: invalid columns or values payload');
  }
  const placeholders = columnNames.map(() => '?').join(',');
  const sql = `INSERT INTO usuarios (${columnNames.join(',')}) VALUES (${placeholders})`;
  await consultar(sql, values);
};

const buscarUsuarioConTipoPorEmail = async (email) => {
  const sql = `SELECT u.*, tu.Tipo_Nombre
         FROM usuarios u
         LEFT JOIN tipo_usuarios tu ON tu.Tipo_Usu_ID = u.Tipo_Usu_ID
        WHERE u.Usu_Email = ?
        LIMIT 1`;
  const [rows] = await consultar(sql, [email]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const actualizarUsuarioPorId = async (userId, assignments, values) => {
  if (!Array.isArray(assignments) || !assignments.length) {
    throw new Error('actualizarUsuarioPorId: no assignments provided');
  }
  if (!Array.isArray(values) || values.length !== assignments.length) {
    throw new Error('actualizarUsuarioPorId: values length mismatch');
  }
  const sql = `UPDATE usuarios SET ${assignments.join(', ')} WHERE Usu_ID = ?`;
  await consultar(sql, [...values, userId]);
};

const obtenerUsuarioBasicoPorId = async (userId) => {
  const sql = 'SELECT Usu_ID, Usu_Email, Usu_Alias, Tipo_Usu_ID FROM usuarios WHERE Usu_ID = ? LIMIT 1';
  const [rows] = await consultar(sql, [userId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const ejecutarConsulta = consultar;

module.exports = {
  consultar,
  ejecutarConsulta,
  buscarUsuarioIdPorAlias,
  obtenerMaximoUsuarioId,
  insertarUsuario,
  buscarUsuarioConTipoPorEmail,
  actualizarUsuarioPorId,
  obtenerUsuarioBasicoPorId,
};
