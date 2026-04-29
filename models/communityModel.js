/**
 * =============================================================
 *  Modelo de Comunidad (communityModel)
 * =============================================================
 *  Descripción:
 *    - Gestiona la consulta y mapeo de usuarios, recetas, comentarios y categorías para la comunidad.
 *    - Proporciona funciones para obtener usuarios destacados, seguidores, perfiles, recetas y comentarios recientes.
 *    - Incluye utilidades para normalizar rutas, roles, especialidades y estadísticas.
 *
 *  Funciones principales:
 *    - obtenerUsuariosComunidad():      Obtiene usuarios destacados/filtrados
 *    - obtenerSeguidosPorUsuario():     Obtiene usuarios seguidos por un usuario
 *    - resumirGruposSeguidos():         Resume grupos de seguidores
 *    - obtenerPerfilPublicoUsuario():   Obtiene perfil público completo de usuario
 *    - obtenerRecetasRecientes():       Obtiene las mejores recetas del mes
 *    - obtenerComentariosRecientes():   Obtiene comentarios recientes
 *    - obtenerCategorias():             Obtiene categorías y estadísticas
 *
 *  Dependencias:
 *    - pool (conexión a base de datos)
 *
 *  Notas de seguridad:
 *    - Validación y normalización de datos
 *    - Manejo de errores y logs en español
 */
const pool = require('../config/db');

const BANNER_PERFIL_PREDETERMINADO = '/Imagenes/Fondos/Fondo.jpg';
const IMAGEN_RECETA_PREDETERMINADA = '/Imagenes/Recetas/1.png';

const normalizeAvatarPath = (rawPath) => {
  if (!rawPath) return '/Imagenes/Usuarios/0.png';
  const trimmed = String(rawPath).trim();
  if (!trimmed) return '/Imagenes/Usuarios/0.png';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return `/${trimmed.replace(/^\/+/, '')}`;
};

const deriveSpecialtyText = (row) => {
  const category = row.categoria_destacada ? String(row.categoria_destacada).trim() : '';
  if (category) {
    return `Especialista en ${category.toLowerCase()}`;
  }
  const bio = row.Usu_Biografia ? String(row.Usu_Biografia).trim() : '';
  if (bio && bio.toLowerCase() !== 'no bio') {
    return bio.length > 110 ? `${bio.slice(0, 107)}…` : bio;
  }
  return 'Recetas variadas';
};

const mapUserRowToDto = (row) => {
  const aliasRaw = row.Usu_Alias ? String(row.Usu_Alias).trim() : '';
  const alias = aliasRaw ? (aliasRaw.startsWith('@') ? aliasRaw : `@${aliasRaw}`) : '';
  const role = (() => {
    switch (Number(row.Tipo_Usu_ID)) {
      case 1:
        return 'Administrador';
      case 3:
        return 'Miembro premium';
      default:
        return 'Miembro de la comunidad';
    }
  })();

  return {
    id: row.Usu_ID,
    name: row.Usu_Nombre,
    alias,
    role,
    userType: Number(row.Tipo_Usu_ID) || 0,
    specialty: deriveSpecialtyText(row),
    city: 'Ubicación no disponible',
    followers: Number(row.followers_count) || 0,
    recipes: Number(row.recetas_count) || 0,
    avatar: normalizeAvatarPath(row.Usu_Foto),
    profileUrl: alias ? `/perfil/${encodeURIComponent(alias.replace(/^@/, ''))}` : `/perfil/${row.Usu_ID}`
  };
};

const buildUserQuery = (whereClause = '', orderClause = '', limitClause = '') => `
  SELECT
    u.Usu_ID,
    u.Usu_Nombre,
    u.Usu_Alias,
    u.Usu_Biografia,
    u.Usu_Foto,
    u.Tipo_Usu_ID,
    tu.Tipo_Nombre,
    COUNT(DISTINCT r.Rec_ID) AS recetas_count,
    COUNT(DISTINCT us.Seguidor_ID) AS followers_count,
    (
      SELECT c.Cat_Nombre
      FROM recetas r2
      LEFT JOIN categorias c ON c.Cat_ID = r2.Cat_ID
      WHERE r2.Usu_ID = u.Usu_ID
      GROUP BY c.Cat_Nombre
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS categoria_destacada
  FROM usuarios u
  LEFT JOIN tipo_usuarios tu ON tu.Tipo_Usu_ID = u.Tipo_Usu_ID
  LEFT JOIN recetas r ON r.Usu_ID = u.Usu_ID
  LEFT JOIN usuarios_seguidores us ON us.Seguido_ID = u.Usu_ID
  ${whereClause}
  GROUP BY u.Usu_ID
  ${orderClause}
  ${limitClause}
`;

const obtenerUsuariosComunidad = async ({ where = '', order = '', limit = '', params = [] } = {}) => {
  const sql = buildUserQuery(where, order, limit);
  const [rows] = await pool.query(sql, params);
  return rows.map(mapUserRowToDto);
};

const obtenerSeguidosPorUsuario = async (followerId) => {
  const sql = `
    SELECT
      u.Usu_ID,
      u.Usu_Nombre,
      u.Usu_Alias,
      u.Usu_Biografia,
      u.Usu_Foto,
      u.Tipo_Usu_ID,
      tu.Tipo_Nombre,
      COUNT(DISTINCT r.Rec_ID) AS recetas_count,
      COUNT(DISTINCT usFollowers.Seguidor_ID) AS followers_count,
      MAX(rel.Fecha_Seguimiento) AS follow_since,
      (
        SELECT c.Cat_Nombre
        FROM recetas r2
        LEFT JOIN categorias c ON c.Cat_ID = r2.Cat_ID
        WHERE r2.Usu_ID = u.Usu_ID
        GROUP BY c.Cat_Nombre
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS categoria_destacada
    FROM usuarios_seguidores rel
    JOIN usuarios u ON u.Usu_ID = rel.Seguido_ID
    LEFT JOIN tipo_usuarios tu ON tu.Tipo_Usu_ID = u.Tipo_Usu_ID
    LEFT JOIN recetas r ON r.Usu_ID = u.Usu_ID
    LEFT JOIN usuarios_seguidores usFollowers ON usFollowers.Seguido_ID = u.Usu_ID
    WHERE rel.Seguidor_ID = ?
    GROUP BY rel.Seguido_ID
    ORDER BY follow_since DESC, u.Usu_Nombre ASC
  `;

  const [rows] = await pool.query(sql, [followerId]);
  return rows.map((row) => {
    const dto = mapUserRowToDto(row);
    if (row.follow_since) {
      try {
        dto.followedSince = new Date(row.follow_since).toISOString();
      } catch (error) {
        dto.followedSince = null;
      }
    } else {
      dto.followedSince = null;
    }
    return dto;
  });
};

const resumirGruposSeguidos = (users = []) => {
  let chefs = 0;
  let friends = 0;
  for (const user of users) {
    if (Number(user.userType) === 3) {
      chefs += 1;
    } else {
      friends += 1;
    }
  }
  return {
    total: users.length,
    chefs,
    friends,
  };
};

const normalizeProfileIdentifier = (raw) => {
  if (!raw) return '';
  return String(raw).trim().replace(/^@+/, '');
};

const isNumericId = (value) => {
  if (value === null || typeof value === 'undefined') return false;
  return /^\d+$/.test(String(value).trim());
};

const normalizePublicAssetPath = (rawPath, fallback = IMAGEN_RECETA_PREDETERMINADA) => {
  if (!rawPath) return fallback;
  const trimmed = String(rawPath).trim();
  if (!trimmed) return fallback;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed.replace(/^\/+/,'')}`;
};

const parseTimeToMinutes = (value) => {
  if (!value && value !== 0) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  const str = String(value);
  const parts = str.split(':').map((part) => Number.parseInt(part, 10));
  if (!parts.length || parts.some((n) => Number.isNaN(n))) return 0;
  const [hours = 0, minutes = 0, seconds = 0] = parts;
  const total = hours * 60 + minutes + Math.round(seconds / 60);
  return Number.isFinite(total) ? Math.max(0, total) : 0;
};

const formatPrepLabel = (minutes) => {
  const total = Number(minutes) || 0;
  if (!total) return '';
  if (total < 60) return `${total} min`;
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (!mins) return `${hrs} h`;
  return `${hrs} h ${mins} min`;
};

const buildDifficultyLabel = (difficulty) => {
  const value = Number(difficulty);
  if (value <= 1) return 'Fácil';
  if (value === 5) return 'Intermedia';
  if (value >= 10) return 'Avanzada';
  return '';
};

const resolveUserRole = (tipo) => {
  const numeric = Number(tipo);
  if (numeric === 1) return 'Administrador';
  if (numeric === 3) return 'Miembro premium';
  return 'Miembro de la comunidad';
};

const buildProfileBadges = (stats = {}, role = '') => {
  const badges = new Set();
  const recipes = Number(stats.recipesCount ?? stats.recipes ?? 0) || 0;
  const followers = Number(stats.followersCount ?? stats.followers ?? 0) || 0;
  const premiumRecipes = Number(stats.premiumRecipes ?? 0) || 0;
  const rating = Number(stats.avgRating ?? stats.rating ?? 0) || 0;
  const ratingsCount = Number(stats.ratingsCount ?? 0) || 0;

  if (role === 'Administrador') badges.add('Chef certificado');
  if (premiumRecipes > 0) badges.add('Contenido premium');
  if (recipes >= 25) badges.add('Creador constante');
  if (followers >= 50) badges.add('Top de la comunidad');
  if (rating >= 4.5 && ratingsCount >= 10) badges.add('Valorado por la comunidad');
  if (!badges.size) badges.add('Miembro activo');

  return Array.from(badges);
};

const normalizeViewerContext = (raw) => {
  if (!raw && raw !== 0) {
    return { id: null, tipo: null };
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const idCandidate = raw.id ?? raw.viewerId ?? raw.userId ?? null;
    const tipoCandidate = raw.tipoUsuario ?? raw.tipo ?? raw.Tipo_Usu_ID ?? null;
    const idNumeric = Number(idCandidate);
    const tipoNumeric = Number(tipoCandidate);
    return {
      id: Number.isFinite(idNumeric) ? idNumeric : null,
      tipo: Number.isFinite(tipoNumeric) ? tipoNumeric : null,
    };
  }

  const idNumeric = Number(raw);
  return {
    id: Number.isFinite(idNumeric) ? idNumeric : null,
    tipo: null,
  };
};

const viewerHasPremium = (viewerId, viewerTipo, ownerId) => {
  if (viewerId && ownerId && Number(viewerId) === Number(ownerId)) return true;
  if (viewerTipo === 1 || viewerTipo === 3) return true;
  return false;
};

const obtenerPerfilPublicoUsuario = async (identifier, viewerContext = {}) => {
  const { id: viewerId, tipo: viewerTipo } = normalizeViewerContext(viewerContext);
  const normalized = normalizeProfileIdentifier(identifier);
  if (!normalized) return null;

  let userRow = null;
  try {
    if (isNumericId(normalized)) {
      const [byId] = await pool.query('SELECT * FROM usuarios WHERE Usu_ID = ? LIMIT 1', [Number(normalized)]);
      if (byId && byId[0]) userRow = byId[0];
    }
    if (!userRow) {
      const [byAlias] = await pool.query('SELECT * FROM usuarios WHERE LOWER(Usu_Alias) = LOWER(?) LIMIT 1', [normalized]);
      if (byAlias && byAlias[0]) userRow = byAlias[0];
    }
  } catch (err) {
    console.error('obtenerPerfilPublicoUsuario - error obteniendo usuario:', err && err.message ? err.message : err);
    throw err;
  }

  if (!userRow) return null;
  const userId = userRow.Usu_ID;

  let statsRow = {
    recipesCount: 0,
    followersCount: 0,
    followingCount: 0,
    avgRating: 0,
    ratingsCount: 0,
    premiumRecipes: 0
  };

  try {
    const [[row]] = await pool.query(
      `
        SELECT
          (SELECT COUNT(*) FROM recetas WHERE Usu_ID = ?) AS recipesCount,
          (SELECT COUNT(*)
           FROM usuarios_seguidores us
           WHERE us.Seguido_ID = ?) AS followersCount,
          (SELECT COUNT(*)
           FROM usuarios_seguidores us2
           WHERE us2.Seguidor_ID = ?) AS followingCount,
          (SELECT ROUND(AVG(c.Cal_Puntuacion), 1)
           FROM calificaciones c
           JOIN recetas r3 ON r3.Rec_ID = c.Rec_ID
           WHERE r3.Usu_ID = ?) AS avgRating,
          (SELECT COUNT(*)
           FROM calificaciones c
           JOIN recetas r4 ON r4.Rec_ID = c.Rec_ID
           WHERE r4.Usu_ID = ?) AS ratingsCount,
          (SELECT SUM(CASE WHEN Tipo_Rec_ID = 2 THEN 1 ELSE 0 END)
           FROM recetas
           WHERE Usu_ID = ?) AS premiumRecipes
      `,
      [userId, userId, userId, userId, userId, userId]
    );
    if (row) {
      statsRow = {
        recipesCount: Number(row.recipesCount) || 0,
        followersCount: Number(row.followersCount) || 0,
        followingCount: Number(row.followingCount) || 0,
        avgRating: Number(row.avgRating) || 0,
        ratingsCount: Number(row.ratingsCount) || 0,
        premiumRecipes: Number(row.premiumRecipes) || 0
      };
    }
  } catch (err) {
    console.error('obtenerPerfilPublicoUsuario - error obteniendo estadísticas:', err && err.message ? err.message : err);
  }

  let categories = [];
  try {
    const [rows] = await pool.query(
      `
        SELECT c.Cat_ID AS id,
               COALESCE(c.Cat_Nombre, 'Sin categoría') AS name,
               COUNT(r.Rec_ID) AS totalRecipes,
               SUM(CASE WHEN r.Tipo_Rec_ID = 2 THEN 1 ELSE 0 END) AS premiumRecipes
        FROM recetas r
        LEFT JOIN categorias c ON c.Cat_ID = r.Cat_ID
        WHERE r.Usu_ID = ?
        GROUP BY c.Cat_ID, c.Cat_Nombre
        ORDER BY totalRecipes DESC, name ASC
        LIMIT 6
      `,
      [userId]
    );
    categories = (rows || []).map((row) => ({
      id: row.id,
      name: row.name || 'Sin categoría',
      totalRecipes: Number(row.totalRecipes) || 0,
      premiumRecipes: Number(row.premiumRecipes) || 0
    }));
  } catch (err) {
    console.error('obtenerPerfilPublicoUsuario - error obteniendo categorías:', err && err.message ? err.message : err);
  }

  let recipes = [];
  try {
    const [rows] = await pool.query(
      `
        SELECT r.Rec_ID,
               r.Rec_Nombre,
               r.Rec_Descripcion,
               r.Rec_Tiempo_Prep,
               r.Rec_Dificultad,
               r.Tipo_Rec_ID,
               r.Rec_Fecha_Publicacion,
               GROUP_CONCAT(DISTINCT ri.Img_Rutas ORDER BY ri.Img_ID SEPARATOR ',') AS images,
               ROUND(AVG(c.Cal_Puntuacion), 1) AS avgRating,
               COUNT(c.Cal_ID) AS ratingsCount
        FROM recetas r
        LEFT JOIN receta_imagenes ri ON ri.Rec_ID = r.Rec_ID
        LEFT JOIN calificaciones c ON c.Rec_ID = r.Rec_ID
        WHERE r.Usu_ID = ?
        GROUP BY r.Rec_ID, r.Rec_Nombre, r.Rec_Descripcion, r.Rec_Tiempo_Prep, r.Rec_Dificultad, r.Tipo_Rec_ID, r.Rec_Fecha_Publicacion
        ORDER BY r.Rec_Fecha_Publicacion DESC
        LIMIT 20
      `,
      [userId]
    );
    recipes = (rows || []).map((row) => {
      const minutes = parseTimeToMinutes(row.Rec_Tiempo_Prep);
      const images = String(row.images || '')
        .split(',')
        .map((img) => img.trim())
        .filter(Boolean)
        .map((img) => normalizePublicAssetPath(img, IMAGEN_RECETA_PREDETERMINADA));

      return {
        id: row.Rec_ID,
        name: row.Rec_Nombre || '',
        description: row.Rec_Descripcion || '',
        minutes,
        timeLabel: formatPrepLabel(minutes),
        difficulty: row.Rec_Dificultad,
        difficultyLabel: buildDifficultyLabel(row.Rec_Dificultad),
        premium: Number(row.Tipo_Rec_ID) === 2,
        rating: Number(row.avgRating) || 0,
        ratingsCount: Number(row.ratingsCount) || 0,
        image: images.length ? images[0] : IMAGEN_RECETA_PREDETERMINADA,
        images,
        isFavorite: false,
      };
    });
  } catch (err) {
    console.error('obtenerPerfilPublicoUsuario - error obteniendo recetas:', err && err.message ? err.message : err);
  }

  if (viewerId && recipes.length) {
    try {
      const recipeIds = recipes.map((recipe) => recipe.id).filter((id) => Number.isFinite(Number(id)));
      if (recipeIds.length) {
        const placeholders = recipeIds.map(() => '?').join(',');
        const params = [viewerId, ...recipeIds];
        const [favoriteRows] = await pool.query(
          `SELECT Rec_ID FROM favoritos WHERE Usu_ID = ? AND Rec_ID IN (${placeholders})`,
          params
        );
        const favoriteSet = new Set((favoriteRows || []).map((row) => Number(row.Rec_ID)));
        recipes = recipes.map((recipe) => ({
          ...recipe,
          isFavorite: favoriteSet.has(Number(recipe.id)),
        }));
      }
    } catch (favoriteErr) {
      console.error('obtenerPerfilPublicoUsuario - error obteniendo favoritos del visor:', favoriteErr && favoriteErr.message ? favoriteErr.message : favoriteErr);
    }
  }

  let followerSummaries = [];
  try {
    const [rows] = await pool.query(
      `
        SELECT us.Seguidor_ID AS followerId
        FROM usuarios_seguidores us
        WHERE us.Seguido_ID = ?
        ORDER BY us.Fecha_Seguimiento DESC
        LIMIT 12
      `,
      [userId]
    );
    const followerIds = (rows || []).map((row) => row.followerId).filter(Boolean);
    if (followerIds.length) {
      const placeholders = followerIds.map(() => '?').join(',');
      const followersData = await obtenerUsuariosComunidad({
        where: `WHERE u.Usu_ID IN (${placeholders})`,
        params: followerIds
      });
      const followerMap = new Map(followersData.map((f) => [f.id, f]));
      followerSummaries = followerIds
        .map((id) => followerMap.get(id))
        .filter(Boolean);
    }
  } catch (err) {
    console.error('obtenerPerfilPublicoUsuario - error obteniendo seguidores:', err && err.message ? err.message : err);
  }

  let isFollowing = false;
  if (viewerId && viewerId !== userId) {
    try {
      const [rows] = await pool.query(
        'SELECT 1 FROM usuarios_seguidores WHERE Seguidor_ID = ? AND Seguido_ID = ? LIMIT 1',
        [viewerId, userId]
      );
      isFollowing = Array.isArray(rows) && rows.length > 0;
    } catch (err) {
      console.error('obtenerPerfilPublicoUsuario - error verificando seguimiento:', err && err.message ? err.message : err);
    }
  }

  const topCategoryName = categories.length ? categories[0].name : '';
  const specialty = deriveSpecialtyText({ ...userRow, categoria_destacada: topCategoryName });
  const role = resolveUserRole(userRow.Tipo_Usu_ID);

  let memberSince = null;
  try {
    memberSince = userRow.Usu_Fecha_Registro ? new Date(userRow.Usu_Fecha_Registro).toISOString() : null;
  } catch (err) {
    memberSince = null;
  }

  const isSelf = Boolean(viewerId) && viewerId === userId;
  const viewerPremiumAccess = viewerHasPremium(viewerId, viewerTipo, userId);

  const stats = {
    recipes: statsRow.recipesCount,
    followers: statsRow.followersCount,
    following: statsRow.followingCount,
    rating: Number(statsRow.avgRating) || 0,
    ratingsCount: statsRow.ratingsCount,
    premiumRecipes: statsRow.premiumRecipes
  };

  const bannerCandidate = typeof userRow.Usu_Banner !== 'undefined' ? userRow.Usu_Banner : null;

  return {
    id: userId,
    name: userRow.Usu_Nombre || '',
    alias: userRow.Usu_Alias || '',
    displayAlias: userRow.Usu_Alias ? `@${String(userRow.Usu_Alias).replace(/^@+/, '')}` : '',
    bio: (userRow.Usu_Biografia || userRow.Usu_Bio || '').toString(),
    role,
    specialty,
    memberSince,
    avatar: normalizeAvatarPath(userRow.Usu_Foto),
    banner: normalizePublicAssetPath(bannerCandidate, BANNER_PERFIL_PREDETERMINADO),
    stats,
    badges: buildProfileBadges(statsRow, role),
    categories,
    recipes,
    followers: followerSummaries,
    viewer: {
      isAuthenticated: Boolean(viewerId),
      isSelf,
      canFollow: Boolean(viewerId) && viewerId !== userId,
      isFollowing,
      hasPremiumAccess: viewerPremiumAccess,
      canSeePremium: viewerPremiumAccess,
      roleId: Number.isFinite(Number(viewerTipo)) ? Number(viewerTipo) : null,
    }
  };
};

const obtenerRecetasRecientes = async (viewerId = null) => {
  const normalizedViewerId = Number.isFinite(Number(viewerId)) ? Number(viewerId) : null;
  const params = [];
  const favoriteJoin = normalizedViewerId !== null
    ? `LEFT JOIN (
          SELECT Rec_ID
          FROM favoritos
          WHERE Usu_ID = ?
          GROUP BY Rec_ID
        ) fav ON fav.Rec_ID = r.Rec_ID`
    : '';
  if (normalizedViewerId !== null) {
    params.push(normalizedViewerId);
  }

  const favoriteSelect = normalizedViewerId !== null
    ? 'CASE WHEN MAX(fav.Rec_ID) IS NULL THEN 0 ELSE 1 END AS isFavorite'
    : '0 AS isFavorite';

  const sql = `
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
      GROUP_CONCAT(DISTINCT ri.Img_Rutas ORDER BY ri.Img_ID SEPARATOR ',') AS Img_Rutas,
      COALESCE(MAX(cal.avgRating), 0) AS avgRating,
      COALESCE(MAX(cal.ratingsCount), 0) AS ratingsCount,
      ${favoriteSelect}
    FROM recetas r
    LEFT JOIN receta_imagenes ri ON ri.Rec_ID = r.Rec_ID
    LEFT JOIN (
      SELECT Rec_ID,
             ROUND(AVG(Cal_Puntuacion), 1) AS avgRating,
             COUNT(*) AS ratingsCount
        FROM calificaciones
        GROUP BY Rec_ID
    ) cal ON cal.Rec_ID = r.Rec_ID
    ${favoriteJoin}
    WHERE
      r.Tipo_Rec_ID = 1
      AND r.Rec_Fecha_Publicacion >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
      AND r.Rec_Fecha_Publicacion < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
    GROUP BY
      r.Rec_ID,
      r.Cat_ID,
      r.Usu_ID,
      r.Rec_Nombre,
      r.Rec_Descripcion,
      r.Rec_Instrucciones,
      r.Rec_Fecha_Publicacion,
      r.Rec_Dificultad,
      r.Rec_Tiempo_Prep
    ORDER BY
      avgRating DESC,
      ratingsCount DESC,
      r.Rec_Fecha_Publicacion DESC
    LIMIT 3`;

  const [rows] = await pool.query(sql, params);
  return rows || [];
};

const obtenerComentariosRecientes = async () => {
  const sql = `
      SELECT
        c.Com_ID,
        c.Usu_ID,
        c.Rec_ID,
        c.Com_Comentario,
        u.Usu_Nombre,
        u.Usu_Alias,
        r.Rec_Nombre
      FROM comentarios c
      LEFT JOIN usuarios u ON u.Usu_ID = c.Usu_ID
      LEFT JOIN recetas r ON r.Rec_ID = c.Rec_ID
      ORDER BY RAND()
      LIMIT 8`;
  const [rows] = await pool.query(sql);
  return (rows || []).map((row) => {
    const aliasRaw = row.Usu_Alias ? String(row.Usu_Alias).trim() : '';
    const aliasSlug = aliasRaw ? aliasRaw.replace(/^@+/, '') : '';
    const profileUrl = aliasSlug
      ? `/perfil/${encodeURIComponent(aliasSlug)}`
      : (row.Usu_ID != null ? `/perfil/${row.Usu_ID}` : null);
    const recipeUrl = row.Rec_ID != null ? `/receta/${row.Rec_ID}` : null;

    return {
      ...row,
      Usu_Alias: aliasRaw,
      profileUrl,
      profileSlug: aliasSlug || (row.Usu_ID != null ? String(row.Usu_ID) : ''),
      recipeUrl,
      Rec_Nombre: row.Rec_Nombre || ''
    };
  });
};

const obtenerCategorias = async () => {
  const sql = `
      SELECT
        c.Cat_ID AS id,
        c.Cat_Nombre AS nombre,
        c.Cat_Descripcion AS descripcion,
        c.Cat_Imagen AS imagen,
        COUNT(DISTINCT r.Rec_ID) AS recetas_count,
        SUM(CASE WHEN r.Tipo_Rec_ID = 2 THEN 1 ELSE 0 END) AS premium_count
      FROM categorias c
      LEFT JOIN recetas r ON r.Cat_ID = c.Cat_ID
      GROUP BY c.Cat_ID
      ORDER BY c.Cat_Nombre ASC`;
  const [rows] = await pool.query(sql);
  return rows || [];
};

module.exports = {
  BANNER_PERFIL_PREDETERMINADO,
  IMAGEN_RECETA_PREDETERMINADA,
  obtenerUsuariosComunidad,
  obtenerSeguidosPorUsuario,
  resumirGruposSeguidos,
  obtenerPerfilPublicoUsuario,
  obtenerRecetasRecientes,
  obtenerComentariosRecientes,
  obtenerCategorias,
};
