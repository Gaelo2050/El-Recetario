/**
 * =============================================================
 *  Ruta de Administración de Logros (adminAchievements.js)
 * =============================================================
 *  Descripción:
 *    - Define las rutas para la gestión de logros y niveles en el panel de administración.
 *    - Permite listar, crear, actualizar y eliminar logros, así como consultar niveles.
 *
 *  Rutas principales:
 *    - GET    /           : Listar logros
 *    - POST   /           : Crear logro
 *    - GET    /niveles    : Listar niveles
 *    - GET    /:id        : Obtener logro por ID
 *    - PUT    /:id        : Actualizar logro
 *    - DELETE /:id        : Eliminar logro
 *
 *  Dependencias:
 *    - achievementsAdminController (controlador de logros)
 *    - ensureAuthenticated, ensureAdmin (middleware de seguridad)
 *    - express (framework de rutas)
 *
 *  Notas de seguridad:
 *    - Acceso restringido a usuarios autenticados y administradores
 */
const express = require('express');
const {
  listarLogros,
  obtenerLogro,
  manejadorCrearLogro,
  manejadorActualizarLogro,
  manejadorEliminarLogro,
  listarNiveles
} = require('../controllers/achievementsAdminController');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const ensureAdmin = require('../middleware/ensureAdmin');

const router = express.Router();

router.use(ensureAuthenticated, ensureAdmin);

router.get('/', listarLogros);
router.post('/', manejadorCrearLogro);
router.get('/niveles', listarNiveles);
router.get('/:id', obtenerLogro);
router.put('/:id', manejadorActualizarLogro);
router.delete('/:id', manejadorEliminarLogro);

module.exports = router;
