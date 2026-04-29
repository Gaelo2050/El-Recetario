/**
 * =============================================================
 *  Modelo de Logros (achievementModel)
 * =============================================================
 *  Descripción:
 *    - Gestiona la consulta, creación, edición y eliminación de logros en la base de datos.
 *    - Proporciona funciones para validar niveles, obtener logros, verificar nombres y manejar transacciones.
 *
 *  Funciones principales:
 *    - ObtenerTodosLosLogros():         Obtiene todos los logros
 *    - ObtenerLogrosPorId(id):       Obtiene logro por ID
 *    - ObtenerSiguienteLogroId(conn):   Calcula el siguiente ID disponible
 *    - LogroNombreExiste(name):  Verifica si existe un nombre de logro
 *    - CreaLogro(data):      Crea un nuevo logro (transacción)
 *    - ActualizarLogro(id, data):  Actualiza un logro existente
 *    - EliminaLogro(id):        Elimina un logro y sus relaciones
 *
 *  Dependencias:
 *    - pool (conexión a base de datos)
 *
 *  Notas de seguridad:
 *    - Manejo de transacciones en creación y eliminación
 *    - Validación de duplicados y niveles permitidos
 *    - Manejo de errores y rollback
 */
const pool = require('../config/db');

const VALID_LEVELS = ['Básico', 'Medio', 'Avanzado'];

const mapRowToAchievement = (row) => ({
  id: Number(row.Logro_Id),
  name: row.Logro_Nombre || '',
  description: row.Logro_Descripcion || '',
  level: row.Logro_Nivel || 'Básico',
  points: Number(row.Logro_Puntos || 0)
});

async function ObtenerTodosLosLogros() {
  const [rows] = await pool.query(
    'SELECT Logro_Id, Logro_Nombre, Logro_Descripcion, Logro_Nivel, Logro_Puntos FROM logros ORDER BY Logro_Id ASC'
  );
  return (rows || []).map(mapRowToAchievement);
}

async function ObtenerLogrosPorId(id) {
  const [rows] = await pool.query(
    'SELECT Logro_Id, Logro_Nombre, Logro_Descripcion, Logro_Nivel, Logro_Puntos FROM logros WHERE Logro_Id = ? LIMIT 1',
    [id]
  );
  if (!rows || rows.length === 0) return null;
  return mapRowToAchievement(rows[0]);
}

async function ObtenerSiguienteLogroId(connection) {
  const executor = connection || pool;
  const [rows] = await executor.query('SELECT MAX(Logro_Id) AS maxId FROM logros');
  const maxId = rows && rows[0] && rows[0].maxId ? Number(rows[0].maxId) : 0;
  return maxId + 1;
}

async function LogroNombreExiste(name, excludeId = null) {
  const params = [name];
  let sql = 'SELECT Logro_Id FROM logros WHERE LOWER(Logro_Nombre) = LOWER(?)';
  if (Number.isInteger(excludeId)) {
    sql += ' AND Logro_Id <> ?';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';
  const [rows] = await pool.query(sql, params);
  return rows && rows.length > 0;
}

async function CreaLogro(data) {
  const { id, name, description, level, points } = data;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let achievementId = id;
    if (!Number.isInteger(achievementId) || achievementId <= 0) {
      achievementId = await ObtenerSiguienteLogroId(connection);
    } else {
      const [existingIdRows] = await connection.query(
        'SELECT Logro_Id FROM logros WHERE Logro_Id = ? LIMIT 1',
        [achievementId]
      );
      if (existingIdRows && existingIdRows.length > 0) {
        throw new Error('duplicate_id');
      }
    }

    await connection.query(
      `INSERT INTO logros (Logro_Id, Logro_Nombre, Logro_Descripcion, Logro_Nivel, Logro_Puntos)
       VALUES (?, ?, ?, ?, ?)`,
      [achievementId, name, description, level, points]
    );

    await connection.commit();
    return ObtenerLogrosPorId(achievementId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function ActualizarLogro(id, data) {
  const { name, description, level, points } = data;
  const [result] = await pool.query(
    `UPDATE logros
       SET Logro_Nombre = ?, Logro_Descripcion = ?, Logro_Nivel = ?, Logro_Puntos = ?
     WHERE Logro_Id = ?`,
    [name, description, level, points, id]
  );
  if (!result || result.affectedRows === 0) {
    return null;
  }
  return ObtenerLogrosPorId(id);
}

async function EliminaLogro(id) {
  await pool.query('DELETE FROM usuario_logros WHERE Logro_ID = ?', [id]);
  const [result] = await pool.query('DELETE FROM logros WHERE Logro_Id = ?', [id]);
  return result && result.affectedRows > 0;
}

module.exports = {
  VALID_LEVELS,
  ObtenerTodosLosLogros,
  ObtenerLogrosPorId,
  ObtenerSiguienteLogroId,
  LogroNombreExiste,
  CreaLogro,
  ActualizarLogro,
  EliminaLogro
};
