/**
 * =============================================================
 *  Ruta principal de autenticación Firebase (index.js)
 * =============================================================
 *  Descripción:
 *    - Define las rutas principales para registro, login, logout y recuperación de contraseña usando Firebase.
 *    - Todas las rutas son POST y gestionadas por firebaseAuthController.
 *
 *  Rutas principales:
 *    - POST /api/registro                : Registro de usuario
 *    - POST /api/iniciar-sesion          : Inicio de sesión
 *    - POST /api/cerrar-sesion           : Cierre de sesión
 *    - POST /api/restablecer-contrasena  : Recuperación de contraseña
 *
 *  Dependencias:
 *    - firebaseAuthController (controlador de autenticación Firebase)
 *    - express (framework de rutas)
 *
 *  Notas de seguridad:
 *    - Todas las rutas requieren datos sensibles, validar y proteger adecuadamente
 */
const express = require('express');
const router = express.Router();

const firebaseAuthController = require('../controllers/firebase-auth-controller');

router.post('/api/registro', firebaseAuthController.registrarUsuario);
router.post('/api/iniciar-sesion', firebaseAuthController.iniciarSesion);
router.post('/api/cerrar-sesion', firebaseAuthController.cerrarSesion);
router.post('/api/restablecer-contrasena', firebaseAuthController.restablecerContrasena);

module.exports = router;