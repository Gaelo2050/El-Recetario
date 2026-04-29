/**
 * achievementsAdminController.js
 *
 * Controlador para la administración de logros en El Recetario®.
 * Permite listar, consultar, crear, editar y eliminar logros desde el panel de administración.
 *
 * Funcionalidades principales:
 * - Listar todos los logros y niveles válidos.
 * - Consultar detalles de un logro por ID.
 * - Crear logros nuevos con validación de nombre, descripción, nivel y puntos.
 * - Editar logros existentes con validaciones similares.
 * - Eliminar logros por ID.
 * - Valida duplicados, palabras prohibidas y formatos.
 *
 * Endpoints típicos:
 *   GET    /administrador/logros           → listarLogros
 *   GET    /administrador/logros/:id       → obtenerLogro
 *   POST   /administrador/logros           → manejadorCrearLogro
 *   PUT    /administrador/logros/:id       → manejadorActualizarLogro
 *   DELETE /administrador/logros/:id       → manejadorEliminarLogro
 *   GET    /administrador/logros/levels    → listarNiveles
 *
 * Todas las respuestas de error están traducidas al español y explican el motivo.
 */
const {
  VALID_LEVELS,
  ObtenerTodosLosLogros,
  ObtenerLogrosPorId,
  LogroNombreExiste,
  CreaLogro,
  ActualizarLogro,
  EliminaLogro
} = require('../models/achievementModel');
const profanityFilter = require('../config/profanityFilter');

const sanitizarCadena = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const analizarId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const normalizarNivel = (level) => {
  const normalized = sanitizarCadena(level);
  if (!normalized) return null;
  const lowered = normalized.toLowerCase();
  for (const allowed of VALID_LEVELS) {
    if (allowed.toLowerCase() === lowered) return allowed;
  }
  return null;
};

const analizarPuntos = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 0) return null;
  return parsed;
};

const construirErrorValidacion = (message, extra = {}) => ({
  error: 'validation_error',
  message,
  ...extra
});

async function listarLogros(req, res) {
  try {
    const achievements = await ObtenerTodosLosLogros();
    return res.json({
      total: achievements.length,
      achievements
    });
  } catch (err) {
    console.error('[admin achievements] error al listar:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

async function obtenerLogro(req, res) {
  try {
    const id = analizarId(req.params.id);
    if (!id) {
      return res.status(400).json(construirErrorValidacion('ID de logro inválido'));
    }

    const achievement = await ObtenerLogrosPorId(id);
    if (!achievement) {
      return res.status(404).json({ error: 'not_found' });
    }

    return res.json(achievement);
  } catch (err) {
    console.error('[admin achievements] error al obtener:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

async function manejadorCrearLogro(req, res) {
  try {
    const name = sanitizarCadena(req.body.name);
    const description = sanitizarCadena(req.body.description);
    const level = normalizarNivel(req.body.level);
    const points = analizarPuntos(req.body.points);
    const providedId = typeof req.body.id === 'undefined' ? null : analizarId(req.body.id);

    if (!name) {
      return res.status(400).json(construirErrorValidacion('El nombre es requerido'));
    }
    if (name.length > 100) {
      return res.status(400).json(construirErrorValidacion('El nombre no puede superar 100 caracteres'));
    }
    if (profanityFilter.containsProfanity(name)) {
      return res.status(400).json(construirErrorValidacion('El nombre contiene palabras no permitidas'));
    }
    if (!description) {
      return res.status(400).json(construirErrorValidacion('La descripción es requerida'));
    }
    if (description.length > 255) {
      return res.status(400).json(construirErrorValidacion('La descripción no puede superar 255 caracteres'));
    }
    if (profanityFilter.containsProfanity(description)) {
      return res.status(400).json(construirErrorValidacion('La descripción contiene palabras no permitidas'));
    }
    if (!level) {
      return res.status(400).json(construirErrorValidacion('El nivel especificado no es válido', { nivelesPermitidos: VALID_LEVELS }));
    }
    if (points === null) {
      return res.status(400).json(construirErrorValidacion('Los puntos deben ser un número entero mayor o igual a 0'));
    }

  const duplicateName = await LogroNombreExiste(name, providedId);
    if (duplicateName) {
      return res.status(409).json({ error: 'duplicate_name', message: 'Ya existe un logro con ese nombre' });
    }

    try {
      const created = await CreaLogro({
        id: providedId,
        name,
        description,
        level,
        points
      });
      return res.status(201).json(created);
    } catch (err) {
      if (err && err.message === 'duplicate_id') {
        return res.status(409).json({ error: 'duplicate_id', message: 'El identificador solicitado ya existe' });
      }
      throw err;
    }
  } catch (err) {
    console.error('[admin achievements] error al crear:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

async function manejadorActualizarLogro(req, res) {
  try {
    const id = analizarId(req.params.id);
    if (!id) {
      return res.status(400).json(construirErrorValidacion('ID de logro inválido'));
    }

    const existing = await ObtenerLogrosPorId(id);
    if (!existing) {
      return res.status(404).json({ error: 'not_found' });
    }

    const name = sanitizarCadena(req.body.name);
    const description = sanitizarCadena(req.body.description);
    const level = normalizarNivel(req.body.level);
    const points = analizarPuntos(req.body.points);

    if (!name) {
      return res.status(400).json(construirErrorValidacion('El nombre es requerido'));
    }
    if (name.length > 100) {
      return res.status(400).json(construirErrorValidacion('El nombre no puede superar 100 caracteres'));
    }
    if (profanityFilter.containsProfanity(name)) {
      return res.status(400).json(construirErrorValidacion('El nombre contiene palabras no permitidas'));
    }
    if (!description) {
      return res.status(400).json(construirErrorValidacion('La descripción es requerida'));
    }
    if (description.length > 255) {
      return res.status(400).json(construirErrorValidacion('La descripción no puede superar 255 caracteres'));
    }
    if (profanityFilter.containsProfanity(description)) {
      return res.status(400).json(construirErrorValidacion('La descripción contiene palabras no permitidas'));
    }
    if (!level) {
      return res.status(400).json(construirErrorValidacion('El nivel especificado no es válido', { nivelesPermitidos: VALID_LEVELS }));
    }
    if (points === null) {
      return res.status(400).json(construirErrorValidacion('Los puntos deben ser un número entero mayor o igual a 0'));
    }

  const duplicateName = await LogroNombreExiste(name, id);
    if (duplicateName) {
      return res.status(409).json({ error: 'duplicate_name', message: 'Ya existe un logro con ese nombre' });
    }

    const updated = await ActualizaLogro(id, {
      name,
      description,
      level,
      points
    });

    if (!updated) {
      return res.status(404).json({ error: 'not_found' });
    }

    return res.json(updated);
  } catch (err) {
    console.error('[admin achievements] error al actualizar:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

async function manejadorEliminarLogro(req, res) {
  try {
    const id = analizarId(req.params.id);
    if (!id) {
      return res.status(400).json(construirErrorValidacion('ID de logro inválido'));
    }

    const existing = await ObtenerLogrosPorId(id);
    if (!existing) {
      return res.status(404).json({ error: 'not_found' });
    }

    const removed = await EliminaLogro(id);
    if (!removed) {
      return res.status(500).json({ error: 'internal_error', message: 'No se pudo eliminar el logro' });
    }

    return res.status(204).send();
  } catch (err) {
    console.error('[admin achievements] error al eliminar:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

function listarNiveles(req, res) {
  return res.json({ levels: VALID_LEVELS });
}

module.exports = {
  listarLogros,
  obtenerLogro,
  manejadorCrearLogro,
  manejadorActualizarLogro,
  manejadorEliminarLogro,
  listarNiveles
};
