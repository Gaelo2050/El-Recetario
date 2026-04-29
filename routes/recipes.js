/**
 * =============================================================
 *  Ruta de Recetas (recipes.js)
 * =============================================================
 *  Descripción:
 *    - Define las rutas para la gestión y visualización de recetas, comentarios, favoritos, reportes y búsquedas.
 *    - Permite operaciones CRUD sobre recetas y comentarios, así como gestión de favoritos y calificaciones.
 *
 *  Rutas principales:
 *    - GET    /receta/:id                         : Detalle de receta
 *    - GET    /api/recetas/:id/comentarios        : Comentarios de receta
 *    - GET    /api/recetas/:id/relacionadas       : Recetas relacionadas
 *    - POST   /api/recetas/:id/comentarios        : Agregar comentario
 *    - DELETE /api/recetas/:id/comentarios/:comentarioId : Eliminar comentario
 *    - POST   /api/reportes                        : Crear reporte
 *    - GET    /api/recetas/:id/resumen             : Resumen de receta
 *    - POST   /api/recetas/:id/calificacion        : Calificar receta
 *    - POST   /api/recetas/:id/favorita            : Marcar como favorita
 *    - DELETE /api/recetas/:id/favorita            : Quitar de favoritos
 *    - GET    /api/recetas/buscar                  : Buscar recetas
 *    - GET    /api/recetas/opciones                : Opciones de recetas
 *    - POST   /api/recetas                         : Crear receta
 *    - GET    /recetas                              : Listado de recetas
 *    - GET    /api/mis/recetas-guardadas           : Recetas guardadas del usuario
 *
 *  Dependencias:
 *    - recipesController (controlador de recetas)
 *    - express (framework de rutas)
 *
 *  Notas de seguridad:
 *    - Validación y control de acceso en controladores
 */
const express = require('express');
const {
	renderizarDetalleReceta,
	obtenerComentariosReceta,
	obtenerRecetasRelacionadas,
	publicarComentarioReceta,
	eliminarComentarioReceta,
	crearReporte,
	obtenerResumenReceta,
	calificarReceta,
	marcarFavoritaReceta,
	quitarFavoritaReceta,
	buscarRecetas,
	obtenerOpcionesReceta,
	crearReceta,
	renderizarListaRecetas,
	obtenerRecetasGuardadas,
	obtenerRecetasPropias,
	obtenerRecetaPropiaDetalle,
	actualizarRecetaPropia,
	eliminarRecetaPropia,
} = require('../controllers/recipesController');

const router = express.Router();

router.get('/receta/:id', renderizarDetalleReceta);
router.get('/api/recetas/:id/comentarios', obtenerComentariosReceta);
router.get('/api/recetas/:id/relacionadas', obtenerRecetasRelacionadas);
router.post('/api/recetas/:id/comentarios', publicarComentarioReceta);
router.delete('/api/recetas/:id/comentarios/:comentarioId', eliminarComentarioReceta);
router.post('/api/reportes', crearReporte);
router.get('/api/recetas/:id/resumen', obtenerResumenReceta);
router.post('/api/recetas/:id/calificacion', calificarReceta);
router.post('/api/recetas/:id/favorita', marcarFavoritaReceta);
router.delete('/api/recetas/:id/favorita', quitarFavoritaReceta);
router.get('/api/recetas/buscar', buscarRecetas);
router.get('/api/recetas/opciones', obtenerOpcionesReceta);
router.post('/api/recetas', crearReceta);
router.get('/recetas', renderizarListaRecetas);
router.get('/api/yo/recetas-guardadas', obtenerRecetasGuardadas);
router.get('/api/yo/mis-recetas', obtenerRecetasPropias);
router.get('/api/yo/mis-recetas/:id', obtenerRecetaPropiaDetalle);
router.put('/api/yo/mis-recetas/:id', actualizarRecetaPropia);
router.delete('/api/yo/mis-recetas/:id', eliminarRecetaPropia);

module.exports = router;
