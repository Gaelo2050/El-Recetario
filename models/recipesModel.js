/**
 * =============================================================
 *  Modelo de Recetas (recipesModel)
 * =============================================================
 *  Descripción:
 *    - Gestiona la lógica de acceso y manipulación de recetas, ingredientes, utensilios, comentarios y favoritos.
 *    - Proporciona funciones para CRUD de recetas, búsqueda avanzada, recomendaciones, favoritos y reportes.
 *    - Incluye utilidades para validación, obtención de catálogos y manejo de relaciones entre entidades.
 *
 *  Funciones principales:
 *    - obtenerDetalleRecetaPublicaPorId(), obtenerIngredientesDetalladosPorReceta(), obtenerUtensiliosDetalladosPorReceta()
 *    - obtenerComentariosPorReceta(), guardarComentarioReceta(), eliminarComentarioPorIds()
 *    - obtenerRecetasRelacionadasPorCategoria(), obtenerRecetasRelacionadasPorAutor(), buscarRecetas()
 *    - obtenerRecetasFavoritasPorUsuario(), insertarFavorito(), eliminarFavorito(), guardarCalificacion()
 *    - insertarReceta(), guardarIngredienteReceta(), vincularRecetaConUtensilio(), insertarImagenReceta()
 *    - obtenerCatalogoCategorias(), obtenerCatalogoTiposReceta(), obtenerCatalogoIngredientes(), obtenerCatalogoUtensilios()
 *    - buscarReporteExistente(), insertarReporte(), obtenerResumenCalificacionesReceta(), obtenerCalificacionDeUsuario()
 *
 *  Dependencias:
 *    - pool (conexión a base de datos)
 *
 *  Notas de seguridad:
 *    - Validación de existencia de entidades antes de operaciones
 *    - Manejo de errores y logs
 *    - Uso de parámetros en queries para evitar inyecciones SQL
 */
const pool = require('../config/db');
const DEFAULT_INGREDIENT_TYPE_ID = 1;

const ejecutarConsulta = (sql, params = []) => pool.query(sql, params);
const obtenerConexion = () => pool.getConnection();
const consultar = ejecutarConsulta;

const obtenerConfiguracionPool = () => {
  const connectionConfig = pool && pool.config && pool.config.connectionConfig;
  return connectionConfig ? { ...connectionConfig } : {};
};

let retentionTableEnsured = false;

const ensureUserRetentionTable = async () => {
  if (retentionTableEnsured) return;
  await consultar(`CREATE TABLE IF NOT EXISTS usuarios_retencion (
    Usu_ID INT NOT NULL,
    condicion ENUM('inactivo','no_verificado') NOT NULL,
    fecha_inicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (Usu_ID, condicion),
    CONSTRAINT fk_usuarios_retencion_usuario FOREIGN KEY (Usu_ID)
      REFERENCES usuarios(Usu_ID)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci`);
  retentionTableEnsured = true;
};

const RETENTION_CONDITIONS = new Set(['inactivo', 'no_verificado']);

const registrarRetencionUsuario = async (userId, condicion) => {
  if (!Number.isInteger(Number(userId)) || !RETENTION_CONDITIONS.has(condicion)) return;
  await ensureUserRetentionTable();
  await consultar(
    `INSERT INTO usuarios_retencion (Usu_ID, condicion, fecha_inicio)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE fecha_inicio = VALUES(fecha_inicio)`,
    [userId, condicion]
  );
};

const limpiarRetencionUsuario = async (userId, condicion) => {
  if (!Number.isInteger(Number(userId)) || !RETENTION_CONDITIONS.has(condicion)) return;
  await ensureUserRetentionTable();
  await consultar('DELETE FROM usuarios_retencion WHERE Usu_ID = ? AND condicion = ?', [userId, condicion]);
};

const backfillRetencionUsuarios = async () => {
  await ensureUserRetentionTable();
  await consultar(`INSERT INTO usuarios_retencion (Usu_ID, condicion, fecha_inicio)
    SELECT u.Usu_ID, 'inactivo', COALESCE(u.Usu_Fecha_Registro, NOW())
    FROM usuarios u
    WHERE COALESCE(u.Usu_Activo, 0) = 0 AND u.Tipo_Usu_ID <> 1
    ON DUPLICATE KEY UPDATE fecha_inicio = LEAST(usuarios_retencion.fecha_inicio, VALUES(fecha_inicio))`);
  await consultar(`INSERT INTO usuarios_retencion (Usu_ID, condicion, fecha_inicio)
    SELECT u.Usu_ID, 'no_verificado', COALESCE(u.Usu_Fecha_Registro, NOW())
    FROM usuarios u
    WHERE COALESCE(u.Usu_Verificado, 0) = 0 AND u.Tipo_Usu_ID <> 1
    ON DUPLICATE KEY UPDATE fecha_inicio = LEAST(usuarios_retencion.fecha_inicio, VALUES(fecha_inicio))`);
};

const obtenerRetencionesExpiradas = async (dias = 14) => {
  await ensureUserRetentionTable();
  const sql = `SELECT ur.Usu_ID, ur.condicion
               FROM usuarios_retencion ur
               INNER JOIN usuarios u ON u.Usu_ID = ur.Usu_ID
               WHERE TIMESTAMPDIFF(DAY, ur.fecha_inicio, NOW()) >= ?
                 AND u.Tipo_Usu_ID <> 1
                 AND (
                   (ur.condicion = 'inactivo' AND COALESCE(u.Usu_Activo, 0) = 0)
                   OR
                   (ur.condicion = 'no_verificado' AND COALESCE(u.Usu_Verificado, 0) = 0)
                 )`;
  const [rows] = await consultar(sql, [dias]);
  return rows || [];
};

const obtenerColumnasReportes = async (dbName) => {
  const [rows] = await ejecutarConsulta(
    "SELECT LOWER(COLUMN_NAME) AS columnName FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'reportes'",
    [dbName]
  );
  return rows || [];
};

const obtenerDetalleRecetaPublicaPorId = async (recipeId) => {
  const [rows] = await ejecutarConsulta(
    `SELECT r.Rec_ID, r.Cat_ID, r.Usu_ID, r.Rec_Nombre, r.Rec_Descripcion, r.Rec_Instrucciones,
          r.Rec_Fecha_Publicacion, r.Rec_Dificultad, r.Rec_Tiempo_Prep, r.Rec_Porcion, r.Tipo_Rec_ID,
            GROUP_CONCAT(ri.Img_Rutas SEPARATOR ',') AS Img_Rutas,
            MAX(u.Usu_Nombre) AS Autor_Nombre,
            MAX(u.Usu_Alias) AS Autor_Alias,
            MAX(u.Usu_Foto) AS Autor_Foto,
            MAX(c.Cat_Nombre) AS Cat_Nombre
          FROM recetas r
          LEFT JOIN receta_imagenes ri ON ri.Rec_ID = r.Rec_ID
          LEFT JOIN usuarios u ON u.Usu_ID = r.Usu_ID
          LEFT JOIN categorias c ON c.Cat_ID = r.Cat_ID
          WHERE r.Rec_ID = ?
          GROUP BY r.Rec_ID`,
    [recipeId]
  );
  return rows && rows[0] ? rows[0] : null;
};

const obtenerIngredientesDetalladosPorReceta = async (recipeId) => {
  const [rows] = await ejecutarConsulta(
    `SELECT ri.Rec_ID, ri.Ing_ID, ri.RI_Cantidad, ri.RI_Unidad, i.Ing_Nombre
      FROM receta_ingredientes ri
      JOIN ingredientes i ON ri.Ing_ID = i.Ing_ID
      WHERE ri.Rec_ID = ?`,
    [recipeId]
  );
  return rows || [];
};

const obtenerUtensiliosDetalladosPorReceta = async (recipeId) => {
  const [rows] = await ejecutarConsulta(
    `SELECT ru.Ute_ID AS id, u.Ute_Nombre AS name
      FROM recetas_utensilios ru
      JOIN utensilios u ON u.Ute_ID = ru.Ute_ID
      WHERE ru.Rec_ID = ?
      ORDER BY u.Ute_Nombre`,
    [recipeId]
  );
  return rows || [];
};

const obtenerComentariosPorReceta = async (recipeId) => {
  const [rows] = await ejecutarConsulta(
    `SELECT c.Com_ID AS id, c.Usu_ID AS userId, c.Rec_ID AS recipeId, c.Com_Comentario AS comment,
        u.Usu_Nombre AS userName, u.Usu_Alias AS userAlias, u.Usu_Foto AS userPhoto
         FROM comentarios c
         LEFT JOIN usuarios u ON u.Usu_ID = c.Usu_ID
        WHERE c.Rec_ID = ?
        ORDER BY c.Com_ID DESC`,
    [recipeId]
  );
  return rows || [];
};

const buscarComentarioPorRecetaYUsuario = async (recipeId, userId) => {
  const [[row]] = await ejecutarConsulta(
    'SELECT Com_ID FROM comentarios WHERE Rec_ID = ? AND Usu_ID = ? LIMIT 1',
    [recipeId, userId]
  );
  return row || null;
};

const guardarComentarioReceta = async ({ userId, recipeId, comment }) => {
  const [result] = await ejecutarConsulta(
    'INSERT INTO comentarios (Usu_ID, Rec_ID, Com_Comentario) VALUES (?, ?, ?)',
    [userId, recipeId, comment]
  );
  return result;
};

const obtenerComentarioPorId = async (commentId) => {
  const [rows] = await ejecutarConsulta(
    `SELECT c.Com_ID AS id, c.Usu_ID AS userId, c.Rec_ID AS recipeId, c.Com_Comentario AS comment,
        u.Usu_Nombre AS userName, u.Usu_Alias AS userAlias, u.Usu_Foto AS userPhoto
         FROM comentarios c
         LEFT JOIN usuarios u ON u.Usu_ID = c.Usu_ID
        WHERE c.Com_ID = ?
        LIMIT 1`,
    [commentId]
  );
  return rows && rows[0] ? rows[0] : null;
};

const obtenerComentarioDeUsuarioEnReceta = async ({ recipeId, userId }) => {
  const [rows] = await ejecutarConsulta(
    `SELECT c.Com_ID AS id, c.Usu_ID AS userId, c.Rec_ID AS recipeId, c.Com_Comentario AS comment,
        u.Usu_Nombre AS userName, u.Usu_Alias AS userAlias, u.Usu_Foto AS userPhoto
         FROM comentarios c
         LEFT JOIN usuarios u ON u.Usu_ID = c.Usu_ID
        WHERE c.Rec_ID = ? AND c.Usu_ID = ?
        LIMIT 1`,
    [recipeId, userId]
  );
  return rows && rows[0] ? rows[0] : null;
};

const obtenerPropietarioComentario = async ({ commentId, recipeId }) => {
  const [[row]] = await ejecutarConsulta(
    'SELECT Com_ID, Usu_ID FROM comentarios WHERE Com_ID = ? AND Rec_ID = ? LIMIT 1',
    [commentId, recipeId]
  );
  return row || null;
};

const eliminarComentarioPorIds = async ({ commentId, recipeId }) => {
  await ejecutarConsulta('DELETE FROM comentarios WHERE Com_ID = ? AND Rec_ID = ?', [commentId, recipeId]);
};

const obtenerRecetaBasicaPorId = async (recipeId) => {
  const [[row]] = await ejecutarConsulta(
    'SELECT Rec_ID, Cat_ID, Usu_ID FROM recetas WHERE Rec_ID = ? LIMIT 1',
    [recipeId]
  );
  return row || null;
};

const obtenerRecetasRelacionadasPorCategoria = async ({ recipeId, categoryId }) => {
  const [rows] = await ejecutarConsulta(
    `SELECT r.Rec_ID, r.Rec_Nombre, r.Cat_ID, r.Usu_ID, r.Rec_Tiempo_Prep, r.Rec_Dificultad, r.Rec_Porcion, r.Tipo_Rec_ID,
          r.Rec_Fecha_Publicacion,
                cat.Cat_Nombre,
                MIN(ri.Img_Rutas) AS primaryImage,
                AVG(cal.Cal_Puntuacion) AS avgRating,
                COUNT(cal.Cal_ID) AS ratingsCount,
                u.Usu_Nombre AS Autor_Nombre,
                u.Usu_Alias AS Autor_Alias
           FROM recetas r
           LEFT JOIN receta_imagenes ri ON ri.Rec_ID = r.Rec_ID
           LEFT JOIN calificaciones cal ON cal.Rec_ID = r.Rec_ID
           LEFT JOIN categorias cat ON cat.Cat_ID = r.Cat_ID
           LEFT JOIN usuarios u ON u.Usu_ID = r.Usu_ID
          WHERE r.Rec_ID <> ? AND r.Cat_ID = ?
          GROUP BY r.Rec_ID
          ORDER BY r.Tipo_Rec_ID DESC, r.Rec_Fecha_Publicacion DESC
          LIMIT 20`,
    [recipeId, categoryId]
  );
  return rows || [];
};

const obtenerRecetasRelacionadasPorAutor = async ({ recipeId, authorId }) => {
  const [rows] = await ejecutarConsulta(
    `SELECT r.Rec_ID, r.Rec_Nombre, r.Cat_ID, r.Usu_ID, r.Rec_Tiempo_Prep, r.Rec_Dificultad, r.Rec_Porcion, r.Tipo_Rec_ID,
          r.Rec_Fecha_Publicacion,
                cat.Cat_Nombre,
                MIN(ri.Img_Rutas) AS primaryImage,
                AVG(cal.Cal_Puntuacion) AS avgRating,
                COUNT(cal.Cal_ID) AS ratingsCount,
                u.Usu_Nombre AS Autor_Nombre,
                u.Usu_Alias AS Autor_Alias
           FROM recetas r
           LEFT JOIN receta_imagenes ri ON ri.Rec_ID = r.Rec_ID
           LEFT JOIN calificaciones cal ON cal.Rec_ID = r.Rec_ID
           LEFT JOIN categorias cat ON cat.Cat_ID = r.Cat_ID
           LEFT JOIN usuarios u ON u.Usu_ID = r.Usu_ID
          WHERE r.Rec_ID <> ? AND r.Usu_ID = ?
          GROUP BY r.Rec_ID
          ORDER BY r.Rec_Fecha_Publicacion DESC
          LIMIT 20`,
    [recipeId, authorId]
  );
  return rows || [];
};

const obtenerRecetasRecientesParaRecomendaciones = async ({ recipeId }) => {
  const [rows] = await ejecutarConsulta(
    `SELECT r.Rec_ID, r.Rec_Nombre, r.Cat_ID, r.Usu_ID, r.Rec_Tiempo_Prep, r.Rec_Dificultad, r.Rec_Porcion, r.Tipo_Rec_ID,
          r.Rec_Fecha_Publicacion,
                cat.Cat_Nombre,
                MIN(ri.Img_Rutas) AS primaryImage,
                AVG(cal.Cal_Puntuacion) AS avgRating,
                COUNT(cal.Cal_ID) AS ratingsCount,
                u.Usu_Nombre AS Autor_Nombre,
                u.Usu_Alias AS Autor_Alias
           FROM recetas r
           LEFT JOIN receta_imagenes ri ON ri.Rec_ID = r.Rec_ID
           LEFT JOIN calificaciones cal ON cal.Rec_ID = r.Rec_ID
           LEFT JOIN categorias cat ON cat.Cat_ID = r.Cat_ID
           LEFT JOIN usuarios u ON u.Usu_ID = r.Usu_ID
          WHERE r.Rec_ID <> ?
          GROUP BY r.Rec_ID
          ORDER BY r.Tipo_Rec_ID DESC, r.Rec_Fecha_Publicacion DESC
          LIMIT 30`,
    [recipeId]
  );
  return rows || [];
};

const buscarReporteExistente = async ({ userId, tipoColumn, objetoColumn, type, targetId }) => {
  const [[row]] = await ejecutarConsulta(
    `SELECT Rep_ID FROM reportes WHERE Usu_ID = ? AND ${tipoColumn} = ? AND ${objetoColumn} = ? LIMIT 1`,
    [userId, type, targetId]
  );
  return row || null;
};

const existeReceta = async (recipeId) => {
  const [[row]] = await ejecutarConsulta('SELECT Rec_ID FROM recetas WHERE Rec_ID = ? LIMIT 1', [recipeId]);
  return Boolean(row && row.Rec_ID);
};

const obtenerRecetaParaComentario = async (commentId) => {
  const [[row]] = await ejecutarConsulta('SELECT Rec_ID FROM comentarios WHERE Com_ID = ? LIMIT 1', [commentId]);
  return row || null;
};

const existeUsuario = async (userId) => {
  const [[row]] = await ejecutarConsulta('SELECT Usu_ID FROM usuarios WHERE Usu_ID = ? LIMIT 1', [userId]);
  return Boolean(row && row.Usu_ID);
};

const insertarReporte = async ({ userId, tipoColumn, objetoColumn, type, targetId, motivo, estado }) => {
  const [result] = await ejecutarConsulta(
    `INSERT INTO reportes (Usu_ID, ${tipoColumn}, ${objetoColumn}, Rep_Motivo, Rep_Estado) VALUES (?, ?, ?, ?, ?)`
      .replace(/\s+/g, ' '),
    [userId, type, targetId, motivo, estado]
  );
  return result;
};

const obtenerResumenCalificacionesReceta = async (recipeId) => {
  const [[row]] = await ejecutarConsulta(
    'SELECT ROUND(AVG(Cal_Puntuacion), 2) AS avgRating, COUNT(*) AS totalRatings FROM calificaciones WHERE Rec_ID = ?',
    [recipeId]
  );
  return {
    avgRating: row && row.avgRating != null ? Number(row.avgRating) : null,
    totalRatings: row && row.totalRatings != null ? Number(row.totalRatings) : 0,
  };
};

const obtenerCalificacionDeUsuario = async ({ recipeId, userId }) => {
  const [[row]] = await ejecutarConsulta(
    'SELECT Cal_Puntuacion FROM calificaciones WHERE Rec_ID = ? AND Usu_ID = ? LIMIT 1',
    [recipeId, userId]
  );
  return row && row.Cal_Puntuacion != null ? Number(row.Cal_Puntuacion) : null;
};

const esRecetaFavorita = async ({ recipeId, userId }) => {
  const [[row]] = await ejecutarConsulta(
    'SELECT Fav_ID FROM favoritos WHERE Rec_ID = ? AND Usu_ID = ? LIMIT 1',
    [recipeId, userId]
  );
  return row || null;
};

const obtenerSiguienteFavoritoId = async () => {
  const [[row]] = await ejecutarConsulta('SELECT COALESCE(MAX(Fav_ID), 0) AS maxId FROM favoritos');
  return Number(row && row.maxId ? row.maxId : 0) + 1;
};

const insertarFavorito = async ({ favId, userId, recipeId }) => {
  await ejecutarConsulta(
    'INSERT INTO favoritos (Fav_ID, Usu_ID, Rec_ID, Fav_Fecha_Guardado) VALUES (?, ?, ?, NOW())',
    [favId, userId, recipeId]
  );
};

const eliminarFavorito = async ({ recipeId, userId }) => {
  await ejecutarConsulta('DELETE FROM favoritos WHERE Rec_ID = ? AND Usu_ID = ?', [recipeId, userId]);
};

const guardarCalificacion = async ({ recipeId, userId, score }) => {
  await ejecutarConsulta(
    'INSERT INTO calificaciones (Rec_ID, Usu_ID, Cal_Puntuacion) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE Cal_Puntuacion = VALUES(Cal_Puntuacion)',
    [recipeId, userId, score]
  );
};

const buildDifficultyRange = (difficulty) => {
  const diffRanges = {
    facil: [1, 3],
    'fácil': [1, 3],
    media: [4, 6],
    medio: [4, 6],
    dificil: [7, 10],
    'difícil': [7, 10],
  };
  return diffRanges[String(difficulty || '').toLowerCase()] || null;
};

const buscarRecetas = async ({ terms = [], category, difficulty, maxMinutes }) => {
  const sqlParts = [];
  const params = [];

  terms.forEach((term) => {
    const like = `%${term}%`;
    sqlParts.push(`(
        r.Rec_Nombre LIKE ?
        OR r.Rec_Descripcion LIKE ?
        OR EXISTS (
          SELECT 1
            FROM receta_ingredientes ri2
            JOIN ingredientes i2 ON i2.Ing_ID = ri2.Ing_ID
           WHERE ri2.Rec_ID = r.Rec_ID
             AND (i2.Ing_Nombre LIKE ? OR IFNULL(ri2.RI_Notas, '') LIKE ?)
        )
      )`);
    params.push(like, like, like, like);
  });

  if (category) {
    const numericCategory = Number(category);
    if (Number.isFinite(numericCategory) && numericCategory > 0) {
      sqlParts.push('r.Cat_ID = ?');
      params.push(numericCategory);
    } else {
      sqlParts.push('EXISTS (SELECT 1 FROM categorias cat WHERE cat.Cat_ID = r.Cat_ID AND cat.Cat_Nombre LIKE ?)');
      params.push(`%${category}%`);
    }
  }

  const range = buildDifficultyRange(difficulty);
  if (range) {
    sqlParts.push('r.Rec_Dificultad BETWEEN ? AND ?');
    params.push(range[0], range[1]);
  }

  if (Number.isFinite(maxMinutes) && maxMinutes > 0) {
    sqlParts.push('TIME_TO_SEC(r.Rec_Tiempo_Prep) <= ?');
    params.push(maxMinutes * 60);
  }

  const whereClause = sqlParts.length ? `WHERE ${sqlParts.join(' AND ')}` : '';

  const sql = `
      SELECT
        r.Rec_ID,
        r.Cat_ID,
        r.Usu_ID,
        r.Rec_Nombre,
        r.Rec_Descripcion,
        r.Rec_Porcion,
        r.Rec_Tiempo_Prep,
        r.Rec_Dificultad,
        GROUP_CONCAT(DISTINCT ri.Img_Rutas ORDER BY ri.Img_ID SEPARATOR ',') AS Img_Rutas,
        ROUND(AVG(c.Cal_Puntuacion), 2) AS AvgRating,
        COUNT(DISTINCT c.Cal_ID) AS TotalRatings
      FROM recetas r
      LEFT JOIN receta_imagenes ri ON ri.Rec_ID = r.Rec_ID
      LEFT JOIN calificaciones c ON c.Rec_ID = r.Rec_ID
      ${whereClause}
      GROUP BY r.Rec_ID
      ORDER BY r.Rec_Fecha_Publicacion DESC
      LIMIT 50
    `;

  const [rows] = await ejecutarConsulta(sql, params);
  return rows || [];
};

const obtenerRecetasConMetadatos = async () => {
  const [rows] = await ejecutarConsulta(
    `
      SELECT
        r.Rec_ID,
        r.Cat_ID,
        r.Usu_ID,
        r.Rec_Nombre,
        r.Rec_Descripcion,
        r.Rec_Instrucciones,
        r.Rec_Fecha_Publicacion,
        r.Rec_Dificultad,
        r.Rec_Tiempo_Prep,
        r.Rec_Porcion,
        r.Tipo_Rec_ID,
        MAX(c.Cat_Nombre) AS Cat_Nombre,
        MAX(tr.Tipo_Nombre) AS Tipo_Rec_Nombre,
        GROUP_CONCAT(ri.Img_Rutas SEPARATOR ',') AS Img_Rutas,
        GROUP_CONCAT(DISTINCT ing.Ing_Nombre ORDER BY ing.Ing_Nombre SEPARATOR ',') AS Ingredientes_Nombres,
        MAX(u.Usu_Nombre) AS Autor,
        rating.avgRating,
        rating.totalRatings
      FROM recetas r
      LEFT JOIN receta_imagenes ri ON ri.Rec_ID = r.Rec_ID
      LEFT JOIN categorias c ON c.Cat_ID = r.Cat_ID
      LEFT JOIN receta_ingredientes rin ON rin.Rec_ID = r.Rec_ID
      LEFT JOIN ingredientes ing ON ing.Ing_ID = rin.Ing_ID
      LEFT JOIN usuarios u ON u.Usu_ID = r.Usu_ID
      LEFT JOIN tipo_recetas tr ON tr.Tipo_Rec_ID = r.Tipo_Rec_ID
      LEFT JOIN (
        SELECT Rec_ID, ROUND(AVG(Cal_Puntuacion), 2) AS avgRating, COUNT(*) AS totalRatings
        FROM calificaciones
        GROUP BY Rec_ID
      ) rating ON rating.Rec_ID = r.Rec_ID
      GROUP BY r.Rec_ID
      ORDER BY r.Rec_Fecha_Publicacion DESC`);
  return rows || [];
};

const obtenerRecetasFavoritasPorUsuario = async ({ userId, search, categoryId, sortKey }) => {
  const params = [userId];
  const whereParts = ['f.Usu_ID = ?'];

  if (search) {
    params.push(`%${search}%`, `%${search}%`);
    whereParts.push('(r.Rec_Nombre LIKE ? OR r.Rec_Descripcion LIKE ?)');
  }

  if (Number.isFinite(categoryId) && categoryId > 0) {
    params.push(categoryId);
    whereParts.push('r.Cat_ID = ?');
  }

  const orderMap = {
    recent: 'f.Fav_Fecha_Guardado DESC',
    oldest: 'f.Fav_Fecha_Guardado ASC',
    rating: 'rating.avgRating DESC, f.Fav_Fecha_Guardado DESC',
    alpha: 'r.Rec_Nombre ASC',
    prep_time: 'r.Rec_Tiempo_Prep ASC',
  };
  const orderClause = orderMap[sortKey] || orderMap.recent;
  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const sql = `
      SELECT
        f.Rec_ID AS recipeId,
        f.Fav_Fecha_Guardado AS savedAt,
        r.Rec_Nombre AS name,
        r.Rec_Descripcion AS description,
        r.Rec_Tiempo_Prep AS prepTime,
        r.Rec_Dificultad AS difficulty,
        r.Usu_ID AS authorId,
        u.Usu_Nombre AS authorName,
        u.Usu_Foto AS authorPhoto,
        u.Tipo_Usu_ID AS authorTipo,
        r.Tipo_Rec_ID AS recipeTypeId,
        tr.Tipo_Nombre AS recipeTypeName,
        r.Cat_ID AS categoryId,
        cat.Cat_Nombre AS categoryName,
        img.firstImage AS imagePath,
        rating.avgRating,
        rating.totalRatings
      FROM favoritos f
      JOIN recetas r ON r.Rec_ID = f.Rec_ID
      LEFT JOIN usuarios u ON u.Usu_ID = r.Usu_ID
      LEFT JOIN categorias cat ON cat.Cat_ID = r.Cat_ID
      LEFT JOIN tipo_recetas tr ON tr.Tipo_Rec_ID = r.Tipo_Rec_ID
      LEFT JOIN (
        SELECT Rec_ID, MIN(Img_Rutas) AS firstImage
          FROM receta_imagenes
        GROUP BY Rec_ID
      ) img ON img.Rec_ID = r.Rec_ID
      LEFT JOIN (
        SELECT Rec_ID, ROUND(AVG(Cal_Puntuacion), 2) AS avgRating, COUNT(*) AS totalRatings
          FROM calificaciones
        GROUP BY Rec_ID
      ) rating ON rating.Rec_ID = r.Rec_ID
      ${whereClause}
      ORDER BY ${orderClause}
    `;

  const [rows] = await ejecutarConsulta(sql, params);
  return rows || [];
};

const obtenerRecetasPropiasPorUsuario = async ({ userId, search, categoryId, sortKey }) => {
  const params = [userId];
  const whereParts = ['r.Usu_ID = ?'];

  if (search) {
    params.push(`%${search}%`, `%${search}%`);
    whereParts.push('(r.Rec_Nombre LIKE ? OR r.Rec_Descripcion LIKE ?)');
  }

  if (Number.isFinite(categoryId) && categoryId > 0) {
    params.push(categoryId);
    whereParts.push('r.Cat_ID = ?');
  }

  const orderMap = {
    recent: 'r.Rec_Fecha_Publicacion DESC',
    oldest: 'r.Rec_Fecha_Publicacion ASC',
    rating: 'stats.avgRating DESC, r.Rec_Fecha_Publicacion DESC',
    favorites: 'COALESCE(fav.totalFavorites, 0) DESC, r.Rec_Fecha_Publicacion DESC',
    name: 'r.Rec_Nombre ASC',
  };
  const orderClause = orderMap[sortKey] || orderMap.recent;
  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const sql = `
      SELECT
        r.Rec_ID AS recipeId,
        r.Rec_Nombre AS name,
        r.Rec_Descripcion AS description,
        r.Rec_Fecha_Publicacion AS publishedAt,
        r.Rec_Tiempo_Prep AS prepTime,
        r.Rec_Dificultad AS difficulty,
        r.Rec_Porcion AS portions,
        r.Cat_ID AS categoryId,
        cat.Cat_Nombre AS categoryName,
        r.Tipo_Rec_ID AS recipeTypeId,
        tr.Tipo_Nombre AS recipeTypeName,
        img.firstImage AS imagePath,
        stats.avgRating,
        stats.totalRatings,
        fav.totalFavorites
      FROM recetas r
      LEFT JOIN categorias cat ON cat.Cat_ID = r.Cat_ID
      LEFT JOIN tipo_recetas tr ON tr.Tipo_Rec_ID = r.Tipo_Rec_ID
      LEFT JOIN (
        SELECT Rec_ID, MIN(Img_Rutas) AS firstImage
        FROM receta_imagenes
        GROUP BY Rec_ID
      ) img ON img.Rec_ID = r.Rec_ID
      LEFT JOIN (
        SELECT Rec_ID, ROUND(AVG(Cal_Puntuacion), 2) AS avgRating, COUNT(*) AS totalRatings
        FROM calificaciones
        GROUP BY Rec_ID
      ) stats ON stats.Rec_ID = r.Rec_ID
      LEFT JOIN (
        SELECT Rec_ID, COUNT(*) AS totalFavorites
        FROM favoritos
        GROUP BY Rec_ID
      ) fav ON fav.Rec_ID = r.Rec_ID
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT 100`;

  const [rows] = await ejecutarConsulta(sql, params);
  return rows || [];
};

const obtenerCatalogoCategorias = async () => {
  const [rows] = await ejecutarConsulta('SELECT Cat_ID AS id, Cat_Nombre AS name FROM categorias ORDER BY Cat_Nombre');
  return rows || [];
};

const obtenerCatalogoTiposReceta = async () => {
  const [rows] = await ejecutarConsulta('SELECT Tipo_Rec_ID AS id, Tipo_Nombre AS name FROM tipo_recetas ORDER BY Tipo_Rec_ID');
  return rows || [];
};

const obtenerCatalogoIngredientes = async () => {
  const [rows] = await ejecutarConsulta('SELECT Ing_ID AS id, Ing_Nombre AS name FROM ingredientes ORDER BY Ing_Nombre');
  return rows || [];
};

const obtenerCatalogoUtensilios = async () => {
  const [rows] = await ejecutarConsulta('SELECT Ute_ID AS id, Ute_Nombre AS name FROM utensilios ORDER BY Ute_Nombre');
  return rows || [];
};

const validarExistenciaCategoria = async (connection, categoryId) => {
  const [rows] = await connection.query('SELECT 1 FROM categorias WHERE Cat_ID = ? LIMIT 1', [categoryId]);
  return rows && rows.length > 0;
};

const validarExistenciaTipoReceta = async (connection, recipeTypeId) => {
  const [rows] = await connection.query('SELECT 1 FROM tipo_recetas WHERE Tipo_Rec_ID = ? LIMIT 1', [recipeTypeId]);
  return rows && rows.length > 0;
};

const obtenerSiguienteRecetaId = async (connection) => {
  const [[row]] = await connection.query('SELECT COALESCE(MAX(Rec_ID), 0) + 1 AS nextId FROM recetas FOR UPDATE');
  const candidate = row && row.nextId != null ? Number(row.nextId) : 1;
  return Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
};

const insertarReceta = async (connection, {
  categoryId,
  userId,
  title,
  description,
  instructions,
  difficulty,
  prepTime,
  portions,
  recipeTypeId,
  recipeId,
}) => {
  const resolvedId = Number.isFinite(Number(recipeId)) && Number(recipeId) > 0
    ? Number(recipeId)
    : await obtenerSiguienteRecetaId(connection);

  await connection.query(
    `INSERT INTO recetas (Rec_ID, Cat_ID, Usu_ID, Rec_Nombre, Rec_Descripcion, Rec_Instrucciones, Rec_Dificultad, Rec_Tiempo_Prep, Rec_Porcion, Tipo_Rec_ID)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [resolvedId, categoryId, userId, title, description, instructions, difficulty, prepTime, portions, recipeTypeId]
  );

  return resolvedId;
};

const buscarIngredienteIdPorNombre = async (connection, ingredientName) => {
  const [[row]] = await connection.query(
    'SELECT Ing_ID FROM ingredientes WHERE LOWER(Ing_Nombre) = LOWER(?) LIMIT 1',
    [ingredientName]
  );
  return row && row.Ing_ID ? Number(row.Ing_ID) : null;
};

const insertarIngredienteConConexion = async (connection, ingredientId, ingredientName, typeId = DEFAULT_INGREDIENT_TYPE_ID) => {
  const resolvedTypeId = Number.isFinite(Number(typeId)) && Number(typeId) > 0
    ? Number(typeId)
    : DEFAULT_INGREDIENT_TYPE_ID;
  await connection.query(
    'INSERT INTO ingredientes (Ing_ID, Ing_Tipo_ID, Ing_Nombre) VALUES (?, ?, ?)',
    [ingredientId, resolvedTypeId, ingredientName]
  );
};

const obtenerSiguienteIngredienteIdConConexion = async (connection) => {
  const [[row]] = await connection.query('SELECT COALESCE(MAX(Ing_ID), 0) AS maxId FROM ingredientes');
  return Number(row && row.maxId ? row.maxId : 0) + 1;
};

const guardarIngredienteReceta = async (connection, { recipeId, ingredientId, quantity, unit }) => {
  await connection.query(
    `INSERT INTO receta_ingredientes (Rec_ID, Ing_ID, RI_Cantidad, RI_Unidad)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE RI_Cantidad = VALUES(RI_Cantidad), RI_Unidad = VALUES(RI_Unidad)`,
    [recipeId, ingredientId, quantity || '', unit || '']
  );
};

const insertarOUObtenerUtensilioId = async (connection, utensilName) => {
  const [result] = await connection.query(
    'INSERT INTO utensilios (Ute_Nombre) VALUES (?) ON DUPLICATE KEY UPDATE Ute_ID = LAST_INSERT_ID(Ute_ID)',
    [utensilName]
  );
  const insertId = Number(result && result.insertId);
  if (Number.isFinite(insertId) && insertId > 0) {
    return insertId;
  }
  const [[row]] = await connection.query(
    'SELECT Ute_ID FROM utensilios WHERE LOWER(Ute_Nombre) = LOWER(?) LIMIT 1',
    [utensilName]
  );
  return row && row.Ute_ID ? Number(row.Ute_ID) : null;
};

const vincularRecetaConUtensilio = async (connection, { recipeId, utensilId }) => {
  await connection.query(
    'INSERT INTO recetas_utensilios (Rec_ID, Ute_ID) VALUES (?, ?) ON DUPLICATE KEY UPDATE Rec_ID = Rec_ID',
    [recipeId, utensilId]
  );
};

const obtenerSiguienteImagenRecetaId = async (connection) => {
  const [[row]] = await connection.query('SELECT COALESCE(MAX(Img_ID), 0) AS maxId FROM receta_imagenes');
  return Number(row && row.maxId ? row.maxId : 0) + 1;
};

const insertarImagenReceta = async (connection, { imageId, recipeId, relativePath }) => {
  await connection.query(
    'INSERT INTO receta_imagenes (Img_ID, Rec_ID, Img_Rutas) VALUES (?, ?, ?)',
    [imageId, recipeId, relativePath]
  );
};

const obtenerCategoriasFavoritas = async () => {
  const [rows] = await ejecutarConsulta('SELECT Cat_ID AS id, Cat_Nombre AS name FROM categorias ORDER BY Cat_Nombre ASC');
  return rows || [];
};

const obtenerIdsRecetasFavoritasUsuario = async (userId) => {
  const [rows] = await ejecutarConsulta('SELECT Rec_ID FROM favoritos WHERE Usu_ID = ?', [userId]);
  return rows || [];
};

const obtenerTipoUsuarioPorId = async (userId) => {
  const [[row]] = await ejecutarConsulta('SELECT Tipo_Usu_ID FROM usuarios WHERE Usu_ID = ? LIMIT 1', [userId]);
  return row || null;
};

// Funciones migradas desde authModel.js
const obtenerImagenesReceta = async (recipeId) => {
  const sql = 'SELECT Img_ID, Img_Rutas FROM receta_imagenes WHERE Rec_ID = ? ORDER BY Img_ID';
  const [rows] = await consultar(sql, [recipeId]);
  return rows || [];
};

const existeUsuarioPorEmail = async (email) => {
  const sql = 'SELECT 1 FROM usuarios WHERE Usu_Email = ? LIMIT 1';
  const [rows] = await consultar(sql, [email]);
  return Array.isArray(rows) && rows.length > 0;
};

const obtenerNombresColumnasUsuarios = async (databaseName) => {
  const sql = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios'";
  const [rows] = await consultar(sql, [databaseName]);
  return rows || [];
};

const buscarUsuarioIdPorAliasExcluyendo = async (alias, excludeUserId) => {
  const sql = 'SELECT Usu_ID FROM usuarios WHERE LOWER(Usu_Alias) = LOWER(?) AND Usu_ID <> ? LIMIT 1';
  const [rows] = await consultar(sql, [alias, excludeUserId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const buscarUsuarioIdPorTelefono = async (telefono) => {
  const sql = 'SELECT Usu_ID FROM usuarios WHERE Usu_Telefono = ? LIMIT 1';
  const [rows] = await consultar(sql, [telefono]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerInfoColumnasUsuarios = async (databaseName) => {
  const sql = "SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE, EXTRA FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios'";
  const [rows] = await consultar(sql, [databaseName]);
  return rows || [];
};

const obtenerUsuariosNoAdminConTipo = async () => {
  const sql = `SELECT u.Usu_ID,
              u.Usu_Nombre,
              u.Usu_Email,
              u.Tipo_Usu_ID,
              u.Usu_Fecha_Registro,
              CAST(COALESCE(u.Usu_Activo, 0) AS UNSIGNED) AS Usu_Activo,
              tu.Tipo_Nombre
         FROM usuarios u
         LEFT JOIN tipo_usuarios tu ON tu.Tipo_Usu_ID = u.Tipo_Usu_ID
        WHERE u.Tipo_Usu_ID <> 1
        ORDER BY u.Usu_Fecha_Registro DESC`;
  const [rows] = await consultar(sql);
  return rows || [];
};

const obtenerRecetasAdministracion = async () => {
  const sql = `SELECT r.Rec_ID, r.Rec_Nombre, r.Rec_Fecha_Publicacion, r.Rec_Dificultad, r.Rec_Tiempo_Prep,
              u.Usu_ID, u.Usu_Nombre, c.Cat_ID, c.Cat_Nombre
         FROM recetas r
         LEFT JOIN usuarios u ON u.Usu_ID = r.Usu_ID
         LEFT JOIN categorias c ON c.Cat_ID = r.Cat_ID`;
  const [rows] = await consultar(sql);
  return rows || [];
};

const obtenerReportesAdministracion = async ({ tipoColumn, objetoColumn, fechaColumn }) => {
  const tipoExpr = `r.${tipoColumn}`;
  const objetoExpr = `r.${objetoColumn}`;
  const fechaExpr = `r.${fechaColumn}`;
  const sql = `SELECT r.Rep_ID,
             r.Usu_ID,
             ${tipoExpr} AS tipoReporte,
             ${objetoExpr} AS objetoId,
             r.Rep_Motivo,
             ${fechaExpr} AS fechaReporte,
             r.Rep_Estado,
             u.Usu_Nombre AS reportanteNombre,
             u.Usu_Alias AS reportanteAlias,
             u.Usu_Email AS reportanteEmail,
             rec.Rec_Nombre AS recetaNombre,
             com.Com_Comentario AS comentarioTexto,
             com.Rec_ID AS comentarioRecetaId,
             target.Usu_Nombre AS usuarioReportadoNombre,
             target.Usu_Alias AS usuarioReportadoAlias
        FROM reportes r
        LEFT JOIN usuarios u ON u.Usu_ID = r.Usu_ID
        LEFT JOIN recetas rec ON rec.Rec_ID = ${objetoExpr} AND ${tipoExpr} = 'receta'
        LEFT JOIN comentarios com ON com.Com_ID = ${objetoExpr} AND ${tipoExpr} = 'comentario'
        LEFT JOIN usuarios target ON target.Usu_ID = ${objetoExpr} AND ${tipoExpr} = 'usuario'
       ORDER BY fechaReporte DESC, r.Rep_ID DESC`;
  const [rows] = await consultar(sql);
  return rows || [];
};

const obtenerReporteAdministracionPorId = async ({ reportId, tipoColumn, objetoColumn, fechaColumn }) => {
  if (!reportId) return null;
  const tipoExpr = `r.${tipoColumn}`;
  const objetoExpr = `r.${objetoColumn}`;
  const fechaExpr = `r.${fechaColumn}`;
  const sql = `SELECT
      r.Rep_ID,
      r.Rep_Motivo,
      r.Rep_Estado,
      ${tipoExpr} AS tipoReporte,
      ${objetoExpr} AS objetoId,
      ${fechaExpr} AS fechaReporte,
      r.Usu_ID AS reportanteId,
      u.Usu_Nombre AS reportanteNombre,
      u.Usu_Alias AS reportanteAlias,
      u.Usu_Email AS reportanteEmail,
      u.Usu_Foto AS reportanteFoto,
      rec.Rec_ID AS recetaId,
      rec.Rec_Nombre AS recetaNombre,
      rec.Rec_Descripcion AS recetaDescripcion,
      rec.Rec_Dificultad AS recetaDificultad,
      rec.Rec_Tiempo_Prep AS recetaTiempoPrep,
      rec.Rec_Porcion AS recetaPorciones,
      rec.Rec_Fecha_Publicacion AS recetaFecha,
      rec.Cat_ID AS recetaCategoriaId,
      c.Cat_Nombre AS recetaCategoriaNombre,
      rec.Tipo_Rec_ID AS recetaTipoId,
      tr.Tipo_Nombre AS recetaTipoNombre,
      recAutor.Usu_ID AS recetaAutorId,
      recAutor.Usu_Nombre AS recetaAutorNombre,
      recAutor.Usu_Alias AS recetaAutorAlias,
      ri.imagenPrincipal AS recetaImagenPrincipal,
      com.Com_ID AS comentarioId,
      com.Com_Comentario AS comentarioTexto,
      com.Rec_ID AS comentarioRecetaId,
      comAutor.Usu_ID AS comentarioAutorId,
      comAutor.Usu_Nombre AS comentarioAutorNombre,
      comAutor.Usu_Alias AS comentarioAutorAlias,
      comAutor.Usu_Email AS comentarioAutorEmail,
      comentarioRec.Rec_Nombre AS comentarioRecetaNombre,
      comentarioRecAutor.Usu_ID AS comentarioRecetaAutorId,
      comentarioRecAutor.Usu_Nombre AS comentarioRecetaAutorNombre,
      comentarioRecAutor.Usu_Alias AS comentarioRecetaAutorAlias,
      target.Usu_ID AS usuarioObjetivoId,
      target.Usu_Nombre AS usuarioObjetivoNombre,
      target.Usu_Alias AS usuarioObjetivoAlias,
      target.Usu_Email AS usuarioObjetivoEmail,
      target.Usu_Foto AS usuarioObjetivoFoto,
      target.Tipo_Usu_ID AS usuarioObjetivoTipoId,
      target.Usu_Activo AS usuarioObjetivoActivo,
      target.Usu_Fecha_Registro AS usuarioObjetivoRegistro,
      tu.Tipo_Nombre AS usuarioObjetivoTipoNombre
    FROM reportes r
    LEFT JOIN usuarios u ON u.Usu_ID = r.Usu_ID
    LEFT JOIN recetas rec ON rec.Rec_ID = ${objetoExpr} AND ${tipoExpr} = 'receta'
    LEFT JOIN categorias c ON c.Cat_ID = rec.Cat_ID
    LEFT JOIN tipo_recetas tr ON tr.Tipo_Rec_ID = rec.Tipo_Rec_ID
    LEFT JOIN usuarios recAutor ON recAutor.Usu_ID = rec.Usu_ID
    LEFT JOIN (
      SELECT Rec_ID, MIN(Img_Rutas) AS imagenPrincipal
      FROM receta_imagenes
      GROUP BY Rec_ID
    ) ri ON ri.Rec_ID = rec.Rec_ID
    LEFT JOIN comentarios com ON com.Com_ID = ${objetoExpr} AND ${tipoExpr} = 'comentario'
    LEFT JOIN usuarios comAutor ON comAutor.Usu_ID = com.Usu_ID
    LEFT JOIN recetas comentarioRec ON comentarioRec.Rec_ID = com.Rec_ID
    LEFT JOIN usuarios comentarioRecAutor ON comentarioRecAutor.Usu_ID = comentarioRec.Usu_ID
    LEFT JOIN usuarios target ON target.Usu_ID = ${objetoExpr} AND ${tipoExpr} = 'usuario'
    LEFT JOIN tipo_usuarios tu ON tu.Tipo_Usu_ID = target.Tipo_Usu_ID
    WHERE r.Rep_ID = ?
    LIMIT 1`;
  const [rows] = await consultar(sql, [reportId]);
  return rows && rows[0] ? rows[0] : null;
};

const actualizarEstadoReporte = async (reportId, nuevoEstado) => {
  if (!reportId || typeof nuevoEstado !== 'string') return false;
  const estadoLimpio = nuevoEstado.trim().slice(0, 20) || 'pendiente';
  const [result] = await ejecutarConsulta('UPDATE reportes SET Rep_Estado = ? WHERE Rep_ID = ? LIMIT 1', [estadoLimpio, reportId]);
  return result && result.affectedRows > 0;
};

const obtenerResumenReportesPorObjeto = async ({ tipoColumn, objetoColumn, tipoReporte, objetoId }) => {
  if (!tipoReporte || typeof objetoId === 'undefined' || objetoId === null) {
    return { total: 0, pendientes: 0, resueltos: 0, descartados: 0 };
  }
  const tipoExpr = `r.${tipoColumn}`;
  const objetoExpr = `r.${objetoColumn}`;
  const sql = `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN LOWER(r.Rep_Estado) = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
      SUM(CASE WHEN LOWER(r.Rep_Estado) = 'resuelto' THEN 1 ELSE 0 END) AS resueltos,
      SUM(CASE WHEN LOWER(r.Rep_Estado) IN ('descartado','rechazado') THEN 1 ELSE 0 END) AS descartados
    FROM reportes r
    WHERE ${tipoExpr} = ? AND ${objetoExpr} = ?`;
  const [rows] = await consultar(sql, [tipoReporte, objetoId]);
  const row = rows && rows[0] ? rows[0] : {};
  return {
    total: Number(row.total) || 0,
    pendientes: Number(row.pendientes) || 0,
    resueltos: Number(row.resueltos) || 0,
    descartados: Number(row.descartados) || 0
  };
};

const obtenerReportesRelacionados = async ({ tipoColumn, objetoColumn, fechaColumn, tipoReporte, objetoId, excludeReportId = null, limit = 5 }) => {
  if (!tipoReporte || typeof objetoId === 'undefined' || objetoId === null) {
    return [];
  }
  const tipoExpr = `r.${tipoColumn}`;
  const objetoExpr = `r.${objetoColumn}`;
  const fechaExpr = `r.${fechaColumn}`;
  const normalizedLimit = Number(limit);
  const limitValue = Number.isFinite(normalizedLimit) && normalizedLimit > 0 ? Math.min(normalizedLimit, 15) : 5;
  const conditions = [`${tipoExpr} = ?`, `${objetoExpr} = ?`];
  const params = [tipoReporte, objetoId];
  if (excludeReportId) {
    conditions.push('r.Rep_ID <> ?');
    params.push(excludeReportId);
  }
  params.push(limitValue);
  const sql = `SELECT r.Rep_ID,
      r.Rep_Motivo,
      r.Rep_Estado,
      ${fechaExpr} AS fechaReporte,
      u.Usu_Nombre AS reportanteNombre,
      u.Usu_Alias AS reportanteAlias
    FROM reportes r
    LEFT JOIN usuarios u ON u.Usu_ID = r.Usu_ID
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${fechaExpr} DESC, r.Rep_ID DESC
    LIMIT ?`;
  const [rows] = await consultar(sql, params);
  return rows || [];
};

const obtenerComentariosAdministracion = async () => {
  const sql = `SELECT c.Com_ID, c.Com_Comentario, c.Rec_ID, c.Usu_ID,
              r.Rec_Nombre, r.Rec_Fecha_Publicacion,
              u.Usu_Nombre, u.Usu_Alias, u.Tipo_Usu_ID,
              tu.Tipo_Nombre
         FROM comentarios c
         LEFT JOIN recetas r ON r.Rec_ID = c.Rec_ID
         LEFT JOIN usuarios u ON u.Usu_ID = c.Usu_ID
         LEFT JOIN tipo_usuarios tu ON tu.Tipo_Usu_ID = u.Tipo_Usu_ID
        ORDER BY c.Com_ID DESC`;
  const [rows] = await consultar(sql);
  return rows || [];
};

const obtenerComentarioAdministracionPorId = async (commentId) => {
  const sql = `SELECT
      c.Com_ID AS commentId,
      c.Com_Comentario AS commentText,
      c.Rec_ID AS recipeId,
      c.Usu_ID AS userId,
      u.Usu_Nombre AS userName,
      u.Usu_Alias AS userAlias,
      u.Usu_Email AS userEmail,
      u.Usu_Foto AS userPhoto,
      u.Tipo_Usu_ID AS userTypeId,
      tu.Tipo_Nombre AS userTypeName,
      u.Usu_Fecha_Registro AS userRegisteredAt,
      CAST(COALESCE(u.Usu_Activo, 0) AS UNSIGNED) AS userActive,
      r.Rec_Nombre AS recipeTitle,
      r.Rec_Descripcion AS recipeDescription,
      r.Rec_Tiempo_Prep AS recipePrepTime,
      r.Rec_Porcion AS recipePortions,
      r.Rec_Dificultad AS recipeDifficulty,
      r.Rec_Fecha_Publicacion AS recipePublishedAt,
      r.Tipo_Rec_ID AS recipeTypeId,
      tr.Tipo_Nombre AS recipeTypeName,
      r.Usu_ID AS recipeOwnerId,
      autor.Usu_Nombre AS recipeOwnerName,
      autor.Usu_Alias AS recipeOwnerAlias,
      cat.Cat_ID AS categoryId,
      cat.Cat_Nombre AS categoryName,
      cu.totalComentarios AS userTotalComments,
      ru.totalRecetas AS userTotalRecipes,
      rc.totalComentarios AS recipeTotalComments,
      cal.avgRating AS recipeAvgRating,
      cal.ratingsCount AS recipeRatingsCount,
      ri.imagenPrincipal AS recipePrimaryImage
    FROM comentarios c
    LEFT JOIN usuarios u ON u.Usu_ID = c.Usu_ID
    LEFT JOIN tipo_usuarios tu ON tu.Tipo_Usu_ID = u.Tipo_Usu_ID
    LEFT JOIN recetas r ON r.Rec_ID = c.Rec_ID
    LEFT JOIN usuarios autor ON autor.Usu_ID = r.Usu_ID
    LEFT JOIN categorias cat ON cat.Cat_ID = r.Cat_ID
    LEFT JOIN tipo_recetas tr ON tr.Tipo_Rec_ID = r.Tipo_Rec_ID
    LEFT JOIN (
      SELECT Usu_ID, COUNT(*) AS totalComentarios
      FROM comentarios
      GROUP BY Usu_ID
    ) cu ON cu.Usu_ID = u.Usu_ID
    LEFT JOIN (
      SELECT Usu_ID, COUNT(*) AS totalRecetas
      FROM recetas
      GROUP BY Usu_ID
    ) ru ON ru.Usu_ID = u.Usu_ID
    LEFT JOIN (
      SELECT Rec_ID, COUNT(*) AS totalComentarios
      FROM comentarios
      GROUP BY Rec_ID
    ) rc ON rc.Rec_ID = r.Rec_ID
    LEFT JOIN (
      SELECT Rec_ID, AVG(Cal_Puntuacion) AS avgRating, COUNT(*) AS ratingsCount
      FROM calificaciones
      GROUP BY Rec_ID
    ) cal ON cal.Rec_ID = r.Rec_ID
    LEFT JOIN (
      SELECT Rec_ID, MIN(Img_Rutas) AS imagenPrincipal
      FROM receta_imagenes
      GROUP BY Rec_ID
    ) ri ON ri.Rec_ID = r.Rec_ID
    WHERE c.Com_ID = ?
    LIMIT 1`;
  const [rows] = await ejecutarConsulta(sql, [commentId]);
  return rows && rows[0] ? rows[0] : null;
};

const eliminarComentarioAdministracionPorId = async (commentId) => {
  const [result] = await ejecutarConsulta('DELETE FROM comentarios WHERE Com_ID = ? LIMIT 1', [commentId]);
  return result && result.affectedRows > 0;
};

const obtenerPerfilUsuarioPorId = async (userId) => {
  const sql = 'SELECT Usu_Nombre, Usu_Email, Usu_Foto FROM usuarios WHERE Usu_ID = ? LIMIT 1';
  const [rows] = await consultar(sql, [userId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerTiposUsuarioExcluyendoAdmin = async () => {
  const sql = 'SELECT Tipo_Usu_ID AS id, Tipo_Nombre AS nombre FROM tipo_usuarios WHERE Tipo_Usu_ID <> 1 ORDER BY Tipo_Usu_ID';
  const [rows] = await consultar(sql);
  return rows || [];
};

const obtenerDetalleUsuarioPorId = async (userId) => {
  const sql = `SELECT u.Usu_ID, u.Usu_Nombre, u.Usu_Email, u.Usu_Alias, u.Usu_Telefono, u.Tipo_Usu_ID,
        u.Usu_Biografia, u.Usu_Cum, u.Usu_Genero, u.Ale_ID, u.Usu_Fecha_Registro, u.Usu_Foto,
        u.Usu_Activo AS Usu_Activo, tu.Tipo_Nombre
         FROM usuarios u
         LEFT JOIN tipo_usuarios tu ON tu.Tipo_Usu_ID = u.Tipo_Usu_ID
        WHERE u.Usu_ID = ?
        LIMIT 1`;
  const [rows] = await consultar(sql, [userId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const existeEmailParaOtroUsuario = async (email, excludeUserId) => {
  const sql = 'SELECT Usu_ID FROM usuarios WHERE Usu_Email = ? AND Usu_ID <> ? LIMIT 1';
  const [rows] = await consultar(sql, [email, excludeUserId]);
  return Array.isArray(rows) && rows.length > 0;
};

const existeAliasParaOtroUsuario = async (alias, excludeUserId) => {
  const sql = 'SELECT Usu_ID FROM usuarios WHERE Usu_Alias = ? AND Usu_ID <> ? LIMIT 1';
  const [rows] = await consultar(sql, [alias, excludeUserId]);
  return Array.isArray(rows) && rows.length > 0;
};

const existeTipoUsuarioEditable = async (tipoId) => {
  const sql = 'SELECT 1 FROM tipo_usuarios WHERE Tipo_Usu_ID = ? AND Tipo_Usu_ID <> 1 LIMIT 1';
  const [rows] = await consultar(sql, [tipoId]);
  return Array.isArray(rows) && rows.length > 0;
};

const actualizarRecetaPorId = async (recipeId, assignments, values, connection = null) => {
  if (!Array.isArray(assignments) || !assignments.length) {
    throw new Error('actualizarRecetaPorId: no assignments provided');
  }
  if (!Array.isArray(values) || values.length !== assignments.length) {
    throw new Error('actualizarRecetaPorId: values length mismatch');
  }
  const sql = `UPDATE recetas SET ${assignments.join(', ')} WHERE Rec_ID = ?`;
  const params = [...values, recipeId];
  if (connection) {
    await connection.query(sql, params);
  } else {
    await consultar(sql, params);
  }
};

const obtenerUsuarioConTipoPorId = async (userId) => {
  const sql = `SELECT u.Usu_ID, u.Usu_Nombre, u.Usu_Email, u.Usu_Alias, u.Usu_Telefono, u.Tipo_Usu_ID,
        u.Usu_Biografia, u.Usu_Foto, u.Usu_Activo AS Usu_Activo, tu.Tipo_Nombre
         FROM usuarios u
         LEFT JOIN tipo_usuarios tu ON tu.Tipo_Usu_ID = u.Tipo_Usu_ID
        WHERE u.Usu_ID = ?
        LIMIT 1`;
  const [rows] = await consultar(sql, [userId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerRecetaPorId = async (recipeId) => {
  const sql = 'SELECT Rec_ID FROM recetas WHERE Rec_ID = ? LIMIT 1';
  const [rows] = await consultar(sql, [recipeId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerRecetaEditablePorUsuario = async ({ recipeId, userId }) => {
  const [rows] = await ejecutarConsulta(
    `SELECT Rec_ID, Usu_ID, Rec_Nombre, Rec_Descripcion, Rec_Instrucciones,
            Rec_Dificultad, Rec_Tiempo_Prep, Rec_Porcion, Tipo_Rec_ID, Cat_ID
       FROM recetas
      WHERE Rec_ID = ? AND Usu_ID = ?
      LIMIT 1`,
    [recipeId, userId]
  );
  return rows && rows[0] ? rows[0] : null;
};

const obtenerCategorias = async () => {
  const sql = `SELECT
      Cat_ID AS id,
      Cat_Nombre AS nombre,
      Cat_Descripcion AS descripcion,
      Cat_Imagen AS imagen
    FROM categorias
    ORDER BY Cat_Nombre`;
  const [rows] = await consultar(sql);
  return rows || [];
};

const listarCategoriasAdministracion = async () => {
  const sql = `
    SELECT
      c.Cat_ID AS id,
      c.Cat_Nombre AS nombre,
      c.Cat_Descripcion AS descripcion,
      c.Cat_Imagen AS imagen,
      COUNT(DISTINCT r.Rec_ID) AS recetasCount,
      SUM(CASE WHEN r.Tipo_Rec_ID = 2 THEN 1 ELSE 0 END) AS premiumCount,
      MAX(r.Rec_Fecha_Publicacion) AS ultimaReceta,
      MIN(r.Rec_Fecha_Publicacion) AS primeraReceta
    FROM categorias c
    LEFT JOIN recetas r ON r.Cat_ID = c.Cat_ID
    GROUP BY c.Cat_ID
    ORDER BY c.Cat_Nombre ASC`;
  const [rows] = await consultar(sql);
  return rows || [];
};

const obtenerCategoriaAdministracionPorId = async (categoriaId) => {
  if (!categoriaId) return null;
  const sql = `
    SELECT
      c.Cat_ID AS id,
      c.Cat_Nombre AS nombre,
      c.Cat_Descripcion AS descripcion,
      c.Cat_Imagen AS imagen,
      COUNT(DISTINCT r.Rec_ID) AS recetasCount,
      SUM(CASE WHEN r.Tipo_Rec_ID = 2 THEN 1 ELSE 0 END) AS premiumCount,
      MAX(r.Rec_Fecha_Publicacion) AS ultimaReceta,
      MIN(r.Rec_Fecha_Publicacion) AS primeraReceta
    FROM categorias c
    LEFT JOIN recetas r ON r.Cat_ID = c.Cat_ID
    WHERE c.Cat_ID = ?
    GROUP BY c.Cat_ID
    LIMIT 1`;
  const [rows] = await consultar(sql, [categoriaId]);
  return rows && rows.length ? rows[0] : null;
};

const existeCategoriaConNombre = async (nombre, excludeId = null) => {
  if (!nombre) return false;
  const sql = excludeId
    ? 'SELECT Cat_ID FROM categorias WHERE LOWER(Cat_Nombre) = LOWER(?) AND Cat_ID <> ? LIMIT 1'
    : 'SELECT Cat_ID FROM categorias WHERE LOWER(Cat_Nombre) = LOWER(?) LIMIT 1';
  const params = excludeId ? [nombre, excludeId] : [nombre];
  const [rows] = await consultar(sql, params);
  return Array.isArray(rows) && rows.length > 0;
};

const crearCategoria = async ({ nombre, descripcion = null, imagen = null }) => {
  const sql = 'INSERT INTO categorias (Cat_Nombre, Cat_Descripcion, Cat_Imagen) VALUES (?, ?, ?)';
  const [result] = await consultar(sql, [nombre, descripcion, imagen]);
  const newId = result && typeof result.insertId !== 'undefined' ? Number(result.insertId) : null;
  return newId;
};

const actualizarCategoria = async (categoriaId, payload = {}) => {
  if (!categoriaId) throw new Error('actualizarCategoria: categoriaId requerido');
  const assignments = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(payload, 'nombre')) {
    assignments.push('Cat_Nombre = ?');
    values.push(payload.nombre);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'descripcion')) {
    assignments.push('Cat_Descripcion = ?');
    values.push(payload.descripcion);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'imagen')) {
    assignments.push('Cat_Imagen = ?');
    values.push(payload.imagen);
  }
  if (!assignments.length) {
    return false;
  }
  const sql = `UPDATE categorias SET ${assignments.join(', ')} WHERE Cat_ID = ?`;
  await consultar(sql, [...values, categoriaId]);
  return true;
};

const eliminarCategoria = async (categoriaId) => {
  const sql = 'DELETE FROM categorias WHERE Cat_ID = ? LIMIT 1';
  await consultar(sql, [categoriaId]);
};

const contarRecetasEnCategoria = async (categoriaId) => {
  const sql = 'SELECT COUNT(*) AS total FROM recetas WHERE Cat_ID = ?';
  const [rows] = await consultar(sql, [categoriaId]);
  if (!rows || !rows.length) return 0;
  return Number(rows[0].total) || 0;
};

const obtenerTiposReceta = async () => {
  const sql = 'SELECT Tipo_Rec_ID AS id, Tipo_Nombre AS nombre FROM tipo_recetas ORDER BY Tipo_Nombre';
  const [rows] = await consultar(sql);
  return rows || [];
};

const obtenerDetalleRecetaPorId = async (recipeId) => {
  const sql = `SELECT r.Rec_ID, r.Rec_Nombre, r.Cat_ID, r.Usu_ID, r.Rec_Descripcion, r.Rec_Instrucciones,
              r.Rec_Fecha_Publicacion, r.Rec_Dificultad, r.Rec_Tiempo_Prep, r.Rec_Porcion, r.Tipo_Rec_ID,
              u.Usu_Nombre, c.Cat_Nombre, tr.Tipo_Nombre
         FROM recetas r
         LEFT JOIN usuarios u ON u.Usu_ID = r.Usu_ID
         LEFT JOIN categorias c ON c.Cat_ID = r.Cat_ID
         LEFT JOIN tipo_recetas tr ON tr.Tipo_Rec_ID = r.Tipo_Rec_ID
        WHERE r.Rec_ID = ?
        LIMIT 1`;
  const [rows] = await consultar(sql, [recipeId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerUtensiliosPorReceta = async (recipeId) => {
  const sql = `SELECT u.Ute_ID AS id, u.Ute_Nombre AS name
         FROM recetas_utensilios ru
         JOIN utensilios u ON u.Ute_ID = ru.Ute_ID
        WHERE ru.Rec_ID = ?
        ORDER BY u.Ute_Nombre`;
  const [rows] = await consultar(sql, [recipeId]);
  return rows || [];
};

const obtenerIngredientesPorReceta = async (recipeId) => {
  const sql = `SELECT ri.Ing_ID AS id, i.Ing_Nombre AS name, ri.RI_Cantidad AS quantity, ri.RI_Unidad AS unit
         FROM receta_ingredientes ri
         JOIN ingredientes i ON i.Ing_ID = ri.Ing_ID
        WHERE ri.Rec_ID = ?
        ORDER BY i.Ing_Nombre`;
  const [rows] = await consultar(sql, [recipeId]);
  return rows || [];
};

const obtenerImagenesRecetaOrdenadas = async (recipeId) => {
  const sql = 'SELECT Img_ID, Img_Rutas FROM receta_imagenes WHERE Rec_ID = ? ORDER BY Img_ID';
  const [rows] = await consultar(sql, [recipeId]);
  return rows || [];
};

const obtenerCategoriaPorId = async (categoriaId) => {
  const sql = `SELECT
      Cat_ID,
      Cat_Nombre,
      Cat_Descripcion,
      Cat_Imagen
    FROM categorias
    WHERE Cat_ID = ?
    LIMIT 1`;
  const [rows] = await consultar(sql, [categoriaId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerTipoRecetaPorId = async (tipoRecetaId) => {
  const sql = 'SELECT Tipo_Rec_ID FROM tipo_recetas WHERE Tipo_Rec_ID = ? LIMIT 1';
  const [rows] = await consultar(sql, [tipoRecetaId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerRecetaImagenPorId = async (imageId, recipeId) => {
  const sql = 'SELECT Img_Rutas FROM receta_imagenes WHERE Img_ID = ? AND Rec_ID = ? LIMIT 1';
  const [rows] = await consultar(sql, [imageId, recipeId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const eliminarRecetaImagenPorId = async (imageId, recipeId) => {
  const sql = 'DELETE FROM receta_imagenes WHERE Img_ID = ? AND Rec_ID = ?';
  await consultar(sql, [imageId, recipeId]);
};

const obtenerRecetaImagenPrincipal = async (recipeId) => {
  const sql = 'SELECT Img_ID FROM receta_imagenes WHERE Rec_ID = ? ORDER BY Img_ID LIMIT 1';
  const [rows] = await consultar(sql, [recipeId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerSiguienteRecetaImagenId = async () => {
  const sql = 'SELECT IFNULL(MAX(Img_ID),0) + 1 AS nextId FROM receta_imagenes';
  const [rows] = await consultar(sql);
  return rows && rows.length > 0 ? Number(rows[0].nextId) || 1 : 1;
};

const insertarRecetaImagen = async (imageId, recipeId, ruta) => {
  const sql = 'INSERT INTO receta_imagenes (Img_ID, Rec_ID, Img_Rutas) VALUES (?, ?, ?)';
  await consultar(sql, [imageId, recipeId, ruta]);
};

const actualizarRecetaImagenRuta = async (imageId, ruta) => {
  const sql = 'UPDATE receta_imagenes SET Img_Rutas = ? WHERE Img_ID = ?';
  await consultar(sql, [ruta, imageId]);
};

const eliminarRecetaImagenesExcluyendo = async (recipeId, keepImageId) => {
  const sql = 'DELETE FROM receta_imagenes WHERE Rec_ID = ? AND Img_ID <> ?';
  await consultar(sql, [recipeId, keepImageId]);
};

const eliminarImagenesReceta = async (connection, recipeId) => {
  await connection.query('DELETE FROM receta_imagenes WHERE Rec_ID = ?', [recipeId]);
};

const obtenerSiguienteRecetaImagenIdConConexion = async (connection) => {
  const sql = 'SELECT IFNULL(MAX(Img_ID), 0) AS maxId FROM receta_imagenes';
  const [rows] = await connection.query(sql);
  if (Array.isArray(rows) && rows.length > 0 && typeof rows[0].maxId !== 'undefined') {
    return Number(rows[0].maxId) + 1;
  }
  return 1;
};

const insertarRecetaImagenConConexion = async (connection, imageId, recipeId, ruta) => {
  const sql = 'INSERT INTO receta_imagenes (Img_ID, Rec_ID, Img_Rutas) VALUES (?, ?, ?)';
  await connection.query(sql, [imageId, recipeId, ruta]);
};

const obtenerTipoEIdUsuario = async (userId) => {
  const sql = 'SELECT Usu_ID, Tipo_Usu_ID FROM usuarios WHERE Usu_ID = ? LIMIT 1';
  const [rows] = await consultar(sql, [userId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const actualizarUsuarioFoto = async (userId, fotoPath) => {
  const sql = 'UPDATE usuarios SET Usu_Foto = ? WHERE Usu_ID = ?';
  await consultar(sql, [fotoPath, userId]);
};

const obtenerUsuarioCompletoPorId = async (userId) => {
  const sql = 'SELECT * FROM usuarios WHERE Usu_ID = ?';
  const [rows] = await consultar(sql, [userId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerUsuarioPorAlias = async (alias) => {
  const sql = 'SELECT * FROM usuarios WHERE LOWER(Usu_Alias) = LOWER(?) LIMIT 1';
  const [rows] = await consultar(sql, [alias]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerResumenCalificacionesUsuario = async (userId) => {
  const sql = `SELECT 
          ROUND(AVG(c.Cal_Puntuacion), 2) AS avgRating,
          COUNT(c.Cal_ID) AS cnt
        FROM recetas r
        JOIN calificaciones c ON r.Rec_ID = c.Rec_ID
        WHERE r.Usu_ID = ?`;
  const [rows] = await consultar(sql, [userId]);
  return rows && rows.length > 0 ? rows[0] : { avgRating: 0, cnt: 0 };
};

const obtenerTodosLosLogros = async () => {
  const sql = 'SELECT Logro_Id, Logro_Nombre, Logro_Descripcion, Logro_Nivel, Logro_puntos FROM logros';
  const [rows] = await consultar(sql);
  return rows || [];
};

const obtenerLogrosUsuario = async (userId) => {
  const sql = 'SELECT logro_Id, Usu_Logro_Fecha_obtenido FROM usuario_logros WHERE Usu_ID = ?';
  const [rows] = await consultar(sql, [userId]);
  return rows || [];
};

const existeLogroUsuario = async (userId, logroId) => {
  const sql = 'SELECT 1 FROM usuario_logros WHERE Usu_ID = ? AND logro_Id = ? LIMIT 1';
  const [rows] = await consultar(sql, [userId, logroId]);
  return Array.isArray(rows) && rows.length > 0;
};

const obtenerLogroPorId = async (logroId) => {
  const sql = 'SELECT Logro_Nombre, Logro_puntos FROM logros WHERE Logro_Id = ? LIMIT 1';
  const [rows] = await consultar(sql, [logroId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const insertarLogroUsuario = async (userId, logroId) => {
  const sql = 'INSERT INTO usuario_logros (Usu_ID, logro_Id, Usu_Logro_Fecha_obtenido) VALUES (?, ?, NOW())';
  await consultar(sql, [userId, logroId]);
};

const obtenerNombresColumnasUsuariosSinProcesar = async (databaseName) => {
  const sql = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' ORDER BY ORDINAL_POSITION";
  const [rows] = await consultar(sql, [databaseName]);
  return rows || [];
};

const existeAliasParaOtroUsuarioSinProcesar = async (alias, excludeUserId) => {
  const sql = 'SELECT Usu_ID FROM usuarios WHERE LOWER(Usu_Alias) = LOWER(?) AND Usu_ID <> ? LIMIT 1';
  const [rows] = await consultar(sql, [alias, excludeUserId]);
  return Array.isArray(rows) && rows.length > 0;
};

const obtenerUsuarioParaEliminacion = async (connection, userId) => {
  const sql = 'SELECT Usu_ID, Usu_Nombre, Usu_Email FROM usuarios WHERE Usu_ID = ? LIMIT 1';
  const [rows] = await connection.query(sql, [userId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerIdsRecetasPorUsuario = async (connection, userId) => {
  const sql = 'SELECT Rec_ID FROM recetas WHERE Usu_ID = ?';
  const [rows] = await connection.query(sql, [userId]);
  return rows || [];
};

const eliminarDependenciasRecetas = async (connection, recipeIds) => {
  if (!Array.isArray(recipeIds) || !recipeIds.length) {
    return;
  }
  const placeholders = recipeIds.map(() => '?').join(',');
  await connection.query(`DELETE FROM receta_ingredientes WHERE Rec_ID IN (${placeholders})`, recipeIds);
  await connection.query(`DELETE FROM recetas_utensilios WHERE Rec_ID IN (${placeholders})`, recipeIds);
  await connection.query(`DELETE FROM receta_imagenes WHERE Rec_ID IN (${placeholders})`, recipeIds);
  await connection.query(`DELETE FROM favoritos WHERE Rec_ID IN (${placeholders})`, recipeIds);
  await connection.query(`DELETE FROM comentarios WHERE Rec_ID IN (${placeholders})`, recipeIds);
  await connection.query(`DELETE FROM calificaciones WHERE Rec_ID IN (${placeholders})`, recipeIds);
  await connection.query(`DELETE FROM usuario_logros WHERE Rec_ID IN (${placeholders})`, recipeIds);
};

const eliminarRelacionesUsuario = async (connection, userId) => {
  await connection.query('DELETE FROM usuario_logros WHERE Usu_ID = ?', [userId]);
  await connection.query('DELETE FROM seguidores WHERE Seguidor_ID = ? OR Seguido_ID = ?', [userId, userId]);
  await connection.query('DELETE FROM favoritos WHERE Usu_ID = ?', [userId]);
  await connection.query('DELETE FROM comentarios WHERE Usu_ID = ?', [userId]);
  await connection.query('DELETE FROM reportes WHERE Usu_ID = ?', [userId]);
};

const eliminarUsuarioPorId = async (connection, userId) => {
  await connection.query('DELETE FROM usuarios WHERE Usu_ID = ?', [userId]);
};

const eliminarUtensiliosReceta = async (connection, recipeId) => {
  await connection.query('DELETE FROM recetas_utensilios WHERE Rec_ID = ?', [recipeId]);
};

const eliminarIngredientesReceta = async (connection, recipeId) => {
  await connection.query('DELETE FROM receta_ingredientes WHERE Rec_ID = ?', [recipeId]);
};

const eliminarRecetaPorId = async (connection, recipeId) => {
  await connection.query('DELETE FROM recetas WHERE Rec_ID = ?', [recipeId]);
};

const buscarIngredientePorNombre = async (connection, nombre) => {
  const sql = 'SELECT Ing_ID FROM ingredientes WHERE LOWER(Ing_Nombre) = LOWER(?) LIMIT 1';
  const [rows] = await connection.query(sql, [nombre]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerSiguienteIngredienteId = async (connection) => {
  const sql = 'SELECT IFNULL(MAX(Ing_ID), 0) AS maxId FROM ingredientes';
  const [rows] = await connection.query(sql);
  return rows && rows.length > 0 ? Number(rows[0].maxId) + 1 : 1;
};

const insertarIngrediente = async (connection, ingredienteId, nombre, tipoId = DEFAULT_INGREDIENT_TYPE_ID) => {
  const sql = 'INSERT INTO ingredientes (Ing_ID, Ing_Tipo_ID, Ing_Nombre) VALUES (?, ?, ?)';
  const resolvedTypeId = Number.isFinite(Number(tipoId)) && Number(tipoId) > 0
    ? Number(tipoId)
    : DEFAULT_INGREDIENT_TYPE_ID;
  await connection.query(sql, [ingredienteId, resolvedTypeId, nombre]);
};

const insertarActualizarRecetaIngrediente = async (connection, recipeId, ingredienteId, cantidad, unidad) => {
  const sql = `INSERT INTO receta_ingredientes (Rec_ID, Ing_ID, RI_Cantidad, RI_Unidad)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE RI_Cantidad = VALUES(RI_Cantidad), RI_Unidad = VALUES(RI_Unidad)`;
  await connection.query(sql, [recipeId, ingredienteId, cantidad || '', unidad || '']);
};

const obtenerRecetaParaEliminacion = async (connection, recipeId) => {
  const sql = 'SELECT Rec_ID, Rec_Nombre FROM recetas WHERE Rec_ID = ? LIMIT 1';
  const [rows] = await connection.query(sql, [recipeId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const eliminarRelacionesReceta = async (connection, recipeId) => {
  await connection.query('DELETE FROM recetas_utensilios WHERE Rec_ID = ?', [recipeId]);
  await connection.query('DELETE FROM receta_ingredientes WHERE Rec_ID = ?', [recipeId]);
  await connection.query('DELETE FROM receta_imagenes WHERE Rec_ID = ?', [recipeId]);
  await connection.query('DELETE FROM favoritos WHERE Rec_ID = ?', [recipeId]);
  await connection.query('DELETE FROM comentarios WHERE Rec_ID = ?', [recipeId]);
  await connection.query('DELETE FROM calificaciones WHERE Rec_ID = ?', [recipeId]);
};

const buscarUtensilioPorNombre = async (connection, nombre) => {
  const sql = 'SELECT Ute_ID FROM utensilios WHERE LOWER(Ute_Nombre) = LOWER(?) LIMIT 1';
  const [rows] = await connection.query(sql, [nombre]);
  return rows && rows.length > 0 ? rows[0] : null;
};

const obtenerMaximoUtensilioId = async (connection) => {
  const sql = 'SELECT IFNULL(MAX(Ute_ID), 0) AS maxId FROM utensilios';
  const [rows] = await connection.query(sql);
  return rows && rows.length > 0 ? Number(rows[0].maxId) : 0;
};

const insertarUtensilio = async (connection, utensilioId, nombre) => {
  const sql = 'INSERT INTO utensilios (Ute_ID, Ute_Nombre) VALUES (?, ?)';
  await connection.query(sql, [utensilioId, nombre]);
};

const insertarActualizarRecetaUtensilio = async (connection, recipeId, utensilioId) => {
  const sql = 'INSERT INTO recetas_utensilios (Rec_ID, Ute_ID) VALUES (?, ?) ON DUPLICATE KEY UPDATE Rec_ID = Rec_ID';
  await connection.query(sql, [recipeId, utensilioId]);
};

const obtenerEstadisticasUsuario = async (userId) => {
  const sql = `SELECT
          COUNT(DISTINCT r.Rec_ID) AS recetasPublicadas,
          COUNT(DISTINCT f.Fav_ID) AS recetasFavoritas,
          COUNT(DISTINCT c.Com_ID) AS comentariosRealizados,
          ROUND(AVG(cal.Cal_Puntuacion), 2) AS promedioCalificaciones
        FROM usuarios u
        LEFT JOIN recetas r ON r.Usu_ID = u.Usu_ID
        LEFT JOIN favoritos f ON f.Usu_ID = u.Usu_ID
        LEFT JOIN comentarios c ON c.Usu_ID = u.Usu_ID
        LEFT JOIN calificaciones cal ON cal.Rec_ID = r.Rec_ID
        WHERE u.Usu_ID = ?`;
  const [rows] = await consultar(sql, [userId]);
  return rows && rows.length > 0 ? rows[0] : { recetasPublicadas: 0, recetasFavoritas: 0, comentariosRealizados: 0, promedioCalificaciones: null };
};

const obtenerRecetasPopularesUsuario = async (userId) => {
  const sql = `SELECT r.Rec_ID,
                     r.Rec_Nombre,
                     r.Rec_Fecha_Publicacion,
                     ROUND(AVG(cal.Cal_Puntuacion), 2) AS promedio,
                     COUNT(cal.Cal_ID) AS totalCalificaciones,
                     img.portada AS imagenPortada
                FROM recetas r
                LEFT JOIN calificaciones cal ON cal.Rec_ID = r.Rec_ID
                LEFT JOIN (
                  SELECT Rec_ID, MIN(Img_Rutas) AS portada
                    FROM receta_imagenes
                   GROUP BY Rec_ID
                ) img ON img.Rec_ID = r.Rec_ID
               WHERE r.Usu_ID = ?
               GROUP BY r.Rec_ID, r.Rec_Nombre, r.Rec_Fecha_Publicacion, img.portada
               ORDER BY
                 CASE WHEN AVG(cal.Cal_Puntuacion) IS NULL THEN 1 ELSE 0 END,
                 AVG(cal.Cal_Puntuacion) DESC,
                 COUNT(cal.Cal_ID) DESC,
                 r.Rec_Fecha_Publicacion DESC`;
  const [rows] = await consultar(sql, [userId]);
  return rows || [];
};

const obtenerDistribucionCalificacionesUsuario = async (userId) => {
  const sql = `SELECT cal.Cal_Puntuacion AS puntuacion, COUNT(*) AS total
         FROM calificaciones cal
         JOIN recetas r ON r.Rec_ID = cal.Rec_ID
        WHERE r.Usu_ID = ?
        GROUP BY cal.Cal_Puntuacion
        ORDER BY cal.Cal_Puntuacion`;
  const [rows] = await consultar(sql, [userId]);
  return rows || [];
};

const obtenerActividadMensualUsuario = async (userId) => {
  const sql = `SELECT DATE_FORMAT(r.Rec_Fecha_Publicacion, '%Y-%m') AS mes,
                      COUNT(r.Rec_ID) AS totalRecetas
                 FROM recetas r
                WHERE r.Usu_ID = ?
                GROUP BY DATE_FORMAT(r.Rec_Fecha_Publicacion, '%Y-%m')
                ORDER BY mes ASC`;
  const [rows] = await consultar(sql, [userId]);
  return rows || [];
};

module.exports = {
  obtenerConexion,
  obtenerConfiguracionPool,
  obtenerColumnasReportes,
  obtenerDetalleRecetaPublicaPorId,
  obtenerIngredientesDetalladosPorReceta,
  obtenerUtensiliosDetalladosPorReceta,
  obtenerComentariosPorReceta,
  buscarComentarioPorRecetaYUsuario,
  guardarComentarioReceta,
  obtenerComentarioDeUsuarioEnReceta,
  obtenerComentarioPorId,
  obtenerPropietarioComentario,
  eliminarComentarioPorIds,
  obtenerRecetaBasicaPorId,
  obtenerRecetasRelacionadasPorCategoria,
  obtenerRecetasRelacionadasPorAutor,
  obtenerRecetasRecientesParaRecomendaciones,
  buscarReporteExistente,
  existeReceta,
  obtenerRecetaParaComentario,
  existeUsuario,
  insertarReporte,
  obtenerResumenCalificacionesReceta,
  obtenerCalificacionDeUsuario,
  esRecetaFavorita,
  obtenerSiguienteFavoritoId,
  insertarFavorito,
  eliminarFavorito,
  guardarCalificacion,
  buscarRecetas,
  obtenerRecetasConMetadatos,
  obtenerRecetasFavoritasPorUsuario,
  obtenerRecetasPropiasPorUsuario,
  obtenerCatalogoCategorias,
  obtenerCatalogoTiposReceta,
  obtenerCatalogoIngredientes,
  obtenerCatalogoUtensilios,
  validarExistenciaCategoria,
  validarExistenciaTipoReceta,
  obtenerSiguienteRecetaId,
  insertarReceta,
  buscarIngredienteIdPorNombre,
  insertarIngredienteConConexion,
  obtenerSiguienteIngredienteIdConConexion,
  guardarIngredienteReceta,
  insertarOUObtenerUtensilioId,
  vincularRecetaConUtensilio,
  obtenerSiguienteImagenRecetaId,
  insertarImagenReceta,
  obtenerCategoriasFavoritas,
  obtenerIdsRecetasFavoritasUsuario,
  obtenerTipoUsuarioPorId,
  obtenerImagenesReceta,
  existeUsuarioPorEmail,
  obtenerNombresColumnasUsuarios,
  buscarUsuarioIdPorAliasExcluyendo,
  buscarUsuarioIdPorTelefono,
  obtenerInfoColumnasUsuarios,
  obtenerUsuariosNoAdminConTipo,
  obtenerRecetasAdministracion,
  obtenerReportesAdministracion,
  obtenerReporteAdministracionPorId,
  obtenerResumenReportesPorObjeto,
  obtenerReportesRelacionados,
  obtenerComentariosAdministracion,
  obtenerComentarioAdministracionPorId,
  eliminarComentarioAdministracionPorId,
  actualizarEstadoReporte,
  obtenerPerfilUsuarioPorId,
  obtenerTiposUsuarioExcluyendoAdmin,
  obtenerDetalleUsuarioPorId,
  existeEmailParaOtroUsuario,
  existeAliasParaOtroUsuario,
  existeTipoUsuarioEditable,
  actualizarRecetaPorId,
  obtenerUsuarioConTipoPorId,
  obtenerRecetaPorId,
  obtenerRecetaEditablePorUsuario,
  obtenerCategorias,
  listarCategoriasAdministracion,
  obtenerCategoriaAdministracionPorId,
  existeCategoriaConNombre,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  contarRecetasEnCategoria,
  obtenerTiposReceta,
  obtenerDetalleRecetaPorId,
  obtenerUtensiliosPorReceta,
  obtenerIngredientesPorReceta,
  obtenerImagenesRecetaOrdenadas,
  obtenerCategoriaPorId,
  obtenerTipoRecetaPorId,
  obtenerRecetaImagenPorId,
  eliminarRecetaImagenPorId,
  obtenerRecetaImagenPrincipal,
  obtenerSiguienteRecetaImagenId,
  insertarRecetaImagen,
  actualizarRecetaImagenRuta,
  eliminarRecetaImagenesExcluyendo,
  eliminarImagenesReceta,
  obtenerSiguienteRecetaImagenIdConConexion,
  insertarRecetaImagenConConexion,
  obtenerTipoEIdUsuario,
  actualizarUsuarioFoto,
  obtenerUsuarioCompletoPorId,
  obtenerUsuarioPorAlias,
  obtenerResumenCalificacionesUsuario,
  obtenerTodosLosLogros,
  obtenerLogrosUsuario,
  existeLogroUsuario,
  obtenerLogroPorId,
  insertarLogroUsuario,
  obtenerNombresColumnasUsuariosSinProcesar,
  existeAliasParaOtroUsuarioSinProcesar,
  obtenerUsuarioParaEliminacion,
  obtenerIdsRecetasPorUsuario,
  eliminarDependenciasRecetas,
  eliminarRelacionesUsuario,
  eliminarUsuarioPorId,
  eliminarUtensiliosReceta,
  eliminarIngredientesReceta,
  eliminarRecetaPorId,
  buscarIngredientePorNombre,
  obtenerSiguienteIngredienteId,
  insertarIngrediente,
  insertarActualizarRecetaIngrediente,
  obtenerRecetaParaEliminacion,
  eliminarRelacionesReceta,
  buscarUtensilioPorNombre,
  obtenerMaximoUtensilioId,
  insertarUtensilio,
  insertarActualizarRecetaUtensilio,
  obtenerEstadisticasUsuario,
  obtenerRecetasPopularesUsuario,
  obtenerDistribucionCalificacionesUsuario,
  obtenerActividadMensualUsuario,
  registrarRetencionUsuario,
  limpiarRetencionUsuario,
  obtenerRetencionesExpiradas,
  backfillRetencionUsuarios,
};



