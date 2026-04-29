/**
 * =============================================================
 *  Ruta de API de Comunidad (api.js)
 * =============================================================
 *  Descripción:
 *    - Define las rutas públicas y protegidas para acceder a datos de la comunidad.
 *    - Permite consultar recetas, comentarios, categorías y perfiles de usuarios.
 *
 *  Rutas principales:
 *    - GET /recetas-recientes             : Recetas destacadas del mes
 *    - GET /comentarios-recientes        : Comentarios recientes
 *    - GET /categorias                   : Listado de categorías
 *    - GET /usuarios/destacados          : Usuarios destacados
 *    - GET /usuarios/buscar              : Búsqueda de usuarios
 *    - GET /usuario/seguidos             : Usuarios seguidos (requiere autenticación)
 *    - GET /usuario/perfil/:identificador : Perfil público de usuario
 *
 *  Dependencias:
 *    - communityController (controlador de comunidad)
 *    - ensureAuthenticated (middleware de autenticación)
 *    - express (framework de rutas)
 *
 *  Notas de seguridad:
 *    - Algunas rutas requieren autenticación para acceso a datos sensibles
 */
const express = require('express');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');
const communityController = require('../controllers/communityController');

const router = express.Router();

router.get('/recetas-recientes', communityController.recetasMasRecientes);
router.get('/comentarios-recientes', communityController.comentariosMasRecientes);
router.get('/categorias', communityController.categorias);
router.get('/usuarios/destacados', communityController.usuariosDestacados);
router.get('/usuarios/buscar', communityController.buscarUsuarios);
router.get('/usuario/seguidos', ensureAuthenticated, communityController.siguiendoUsuario);
router.get('/usuario/perfil/:identificador', communityController.perfilUsuario);

module.exports = router;
