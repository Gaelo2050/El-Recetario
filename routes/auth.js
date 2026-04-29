/**
 * =============================================================
 *  Ruta de Autenticación (auth.js)
 * =============================================================
 *  Descripción:
 *    - Exporta el router de autenticación definido en controllers/authController.js.
 *    - Mantiene compatibilidad con la implementación existente de rutas de autenticación.
 *
 *  Dependencias:
 *    - controllers/authController (router de autenticación)
 *
 *  Notas de mantenimiento:
 *    - Archivo de compatibilidad, no contiene lógica propia.
 */
// Mantiene compatibilidad con el router existente implementado en controllers/authController.js
module.exports = require('../controllers/authController');

