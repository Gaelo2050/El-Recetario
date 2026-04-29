/**
 * =============================================================
 *  Ruta de Pagos y Suscripciones (payments.js)
 * =============================================================
 *  Descripción:
 *    - Define las rutas para la gestión de pagos, sesiones de checkout, portal de usuario y webhooks de Stripe.
 *    - Permite iniciar procesos de pago, gestionar sesiones y recibir notificaciones de eventos de Stripe.
 *
 *  Rutas principales:
 *    - POST /crear-sesion-pago     : Iniciar sesión de pago
 *    - POST /crear-sesion-portal   : Iniciar sesión de portal de usuario
 *    - POST /webhook               : Recibir eventos de Stripe (webhook)
 *    - GET  /exito                 : Página de éxito tras pago
 *
 *  Dependencias:
 *    - paymentsController (controlador de pagos)
 *    - express (framework de rutas)
 *
 *  Notas de seguridad:
 *    - Webhook requiere procesamiento seguro de datos sin parseo previo
 *    - Límite de tamaño en payloads para evitar abusos
 */
const express = require('express');
const paymentsController = require('../controllers/paymentsController');

const router = express.Router();

router.post('/crear-sesion-pago', express.json({ limit: '12mb' }), paymentsController.crearSesionPago);
router.post('/crear-sesion-portal', express.json({ limit: '12mb' }), paymentsController.crearSesionPortal);
router.post('/webhook', express.raw({ type: 'application/json' }), paymentsController.procesarWebhook);
router.get('/exito', paymentsController.exito);

module.exports = router;
