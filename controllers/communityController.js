/**
 * =============================================================
 *  Controlador de Comunidad
 * =============================================================
 *  Descripción:
 *    - Gestiona la obtención de recetas, comentarios, usuarios destacados y perfiles de la comunidad.
 *    - Proporciona endpoints para búsqueda de usuarios, categorías, seguidores y perfiles públicos.
 *    - Incluye validaciones de datos y filtro de palabras prohibidas en búsquedas.
 *
 *  Endpoints principales:
 *    - recetasMasRecientes(req, res): Recetas destacadas/recientes
 *    - comentariosMasRecientes(req, res): Comentarios recientes
 *    - categorias(req, res):         Categorías de recetas
 *    - usuariosDestacados(req, res):  Usuarios destacados
 *    - buscarUsuarios(req, res):      Búsqueda de usuarios por nombre, alias, biografía y rol
 *    - siguiendoUsuario(req, res):    Listado de usuarios seguidos por el usuario autenticado
 *    - perfilUsuario(req, res):       Perfil público de usuario
 *
 *  Dependencias:
 *    - communityModel, profanityFilter
 *
 *  Notas de validación y seguridad:
 *    - Filtro de palabras prohibidas en búsquedas y campos sensibles
 *    - Validación de autenticación para operaciones de seguimiento
 *    - Respuestas y mensajes de error en español
 */
const communityModel = require('../models/communityModel');
const profanityFilter = require('../config/profanityFilter');

const analizarCookieUsuario = (raw) => {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch (err) {
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch (decodeErr) {
      return null;
    }
  }
};

const obtenerIdUsuarioSesion = (req) => {
  if (req && req.session && req.session.user && req.session.user.id != null) {
    const numericId = Number(req.session.user.id);
    if (Number.isFinite(numericId)) {
      return numericId;
    }
  }

  if (req && req.cookies && req.cookies.userInfo) {
    const parsed = analizarCookieUsuario(req.cookies.userInfo);
    if (parsed) {
      const candidate = parsed.id != null ? parsed.id : (parsed.Usu_ID != null ? parsed.Usu_ID : parsed.userId);
      const numericId = Number(candidate);
      if (Number.isFinite(numericId)) {
        if (req.session) {
          req.session.user = req.session.user || {};
          req.session.user.id = numericId;
          if (parsed.nombre && !req.session.user.nombre) {
            req.session.user.nombre = parsed.nombre;
          }
          if (parsed.Tipo_Usu_ID != null && req.session.user.Tipo_Usu_ID == null) {
            const tipoNumeric = Number(parsed.Tipo_Usu_ID);
            if (Number.isFinite(tipoNumeric)) {
              req.session.user.Tipo_Usu_ID = tipoNumeric;
            }
          }
        }
        return numericId;
      }
    }
  }

  return null;
};

const recetasMasRecientes = async (req, res) => {
  try {
    const viewerId = obtenerIdUsuarioSesion(req);
    const recipes = await communityModel.obtenerRecetasRecientes(viewerId);
    const normalized = Array.isArray(recipes)
      ? recipes.map((recipe) => {
          const ratingsCount = Number(recipe.ratingsCount || 0);
          const rawAvg = recipe.avgRating != null ? Number(recipe.avgRating) : null;
          const avgRating = ratingsCount > 0 && Number.isFinite(rawAvg) ? Number(rawAvg) : null;
          const favoriteFlag = recipe.isFavorite;
          const isFavorite = favoriteFlag === true
            || favoriteFlag === 1
            || favoriteFlag === '1'
            || favoriteFlag === 'true';

          return {
            ...recipe,
            avgRating,
            ratingsCount,
            isFavorite,
          };
        })
      : [];
    return res.json(normalized);
  } catch (err) {
    console.error('Error al obtener las recetas más recientes:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'error_carga' });
  }
};

const comentariosMasRecientes = async (req, res) => {
  try {
    const comments = await communityModel.obtenerComentariosRecientes();
    return res.json(comments);
  } catch (err) {
    console.error('Error al obtener los comentarios más recientes:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'error_carga' });
  }
};

const categorias = async (req, res) => {
  try {
    const list = await communityModel.obtenerCategorias();
    return res.json(list);
  } catch (err) {
    console.error('Error al obtener las categorías:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'error_carga' });
  }
};

const usuariosDestacados = async (req, res) => {
  try {
    const users = await communityModel.obtenerUsuariosComunidad({
      order: 'ORDER BY recetas_count DESC, followers_count DESC, u.Usu_Fecha_Registro ASC',
      limit: 'LIMIT 6'
    });
    return res.json(users);
  } catch (err) {
    console.error('Error al obtener los usuarios destacados:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'error_carga' });
  }
};

const buscarUsuarios = async (req, res) => {
  try {
    const qRaw = typeof req.query.q === 'string' ? req.query.q : '';
    const roleRaw = typeof req.query.role === 'string' ? req.query.role : '';
    const query = qRaw.trim();
    const roleFilter = roleRaw.trim().toLowerCase();

    if (!query) {
      return res.json([]);
    }

    if (profanityFilter.containsProfanity(query)) {
      return res.status(400).json({ error: 'consulta_contiene_palabras_prohibidas' });
    }
    if (roleFilter && profanityFilter.containsProfanity(roleFilter)) {
      return res.status(400).json({ error: 'consulta_contiene_palabras_prohibidas' });
    }

    const filters = [];
    const params = [];
    const likeQuery = `%${query.toLowerCase()}%`;
    filters.push(`(LOWER(u.Usu_Nombre) LIKE ? OR LOWER(u.Usu_Alias) LIKE ? OR LOWER(COALESCE(u.Usu_Biografia, '')) LIKE ?)`);
    params.push(likeQuery, likeQuery, likeQuery);

    if (roleFilter) {
      if (roleFilter === 'premium') {
        filters.push(`(u.Tipo_Usu_ID = 3 OR LOWER(COALESCE(tu.Tipo_Nombre, '')) LIKE ?)`);
        params.push(`%${roleFilter}%`);
      } else {
        const likeRole = `%${roleFilter}%`;
        filters.push(`(LOWER(COALESCE(u.Usu_Biografia, '')) LIKE ? OR LOWER(u.Usu_Nombre) LIKE ? OR LOWER(u.Usu_Alias) LIKE ?)`);
        params.push(likeRole, likeRole, likeRole);
      }
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const users = await communityModel.obtenerUsuariosComunidad({
      where: whereClause,
      order: 'ORDER BY followers_count DESC, recetas_count DESC, u.Usu_Nombre ASC',
      limit: 'LIMIT 12',
      params
    });

    return res.json(users);
  } catch (err) {
    console.error('Error al buscar usuarios:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'error_busqueda' });
  }
};

const siguiendoUsuario = async (req, res) => {
  try {
    const followerId = req.session && req.session.user && req.session.user.id;
    if (!followerId) {
      return res.status(401).json({ error: 'autenticacion_requerida' });
    }

    const users = await communityModel.obtenerSeguidosPorUsuario(followerId);
    const counts = communityModel.resumirGruposSeguidos(users);

    return res.json({ users, counts });
  } catch (err) {
    console.error('Error al obtener la lista de siguiendo:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'error_carga_seguidos' });
  }
};

const perfilUsuario = async (req, res) => {
  try {
    const viewerId = req.session && req.session.user && req.session.user.id ? req.session.user.id : null;
    const viewerTipo = req.session && req.session.user && req.session.user.Tipo_Usu_ID != null
      ? req.session.user.Tipo_Usu_ID
      : null;
    const profile = await communityModel.obtenerPerfilPublicoUsuario(
      req.params.identificador,
      { id: viewerId, tipoUsuario: viewerTipo }
    );
    if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });
    return res.json(profile);
  } catch (err) {
    console.error('Error en GET /api/usuario/perfil/:identificador:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno al cargar el perfil' });
  }
};

module.exports = {
  recetasMasRecientes,
  comentariosMasRecientes,
  categorias,
  usuariosDestacados,
  buscarUsuarios,
  siguiendoUsuario,
  perfilUsuario,
};
