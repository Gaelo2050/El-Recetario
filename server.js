/**
 * =============================================================
 *  Servidor principal de la aplicación (server.js)
 * =============================================================
 *  Descripción:
 *    - Inicializa y configura el servidor Express para ElRecetario.
 *    - Gestiona rutas, sesiones, cookies, archivos estáticos y middlewares globales.
 *    - Integra los routers de pagos, autenticación, administración, API, recetas y páginas.
 *
 *  Estructura principal:
 *    - Configuración de middlewares: static, session, cookie, body parser
 *    - Integración de routers: payments, auth, adminAchievements, api, recipes, pages
 *    - Redirección a /error para rutas no encontradas
 *    - Inicio del servidor en el puerto configurado
 *
 *  Dependencias:
 *    - express, express-session, cookie-parser, path, dotenv
 *    - Middlewares y routers personalizados
 *
 *  Notas de seguridad:
 *    - La cookie de sesión no es segura (secure: false), revisar para producción
 *    - Limitar tamaño de payloads en JSON y formularios
 *    - Validar rutas y acceso en routers
 */
// server.js
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');

require('dotenv').config();

const sessionCookieSync = require('./middleware/sessionCookieSync');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'tu_secreto';
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/views', express.static(path.join(__dirname, 'views')));
app.use('/Imagenes', express.static(path.join(__dirname, 'Imagenes')));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 365 * 10,
  },
}));

app.use(sessionCookieSync);

const paymentsRouter = require('./routes/payments');
app.use('/', paymentsRouter);

app.use(express.json({ limit: '12mb' }));

const router = require('./routes');
app.use(router);

const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

const adminAchievementsRoutes = require('./routes/adminAchievements');
app.use('/api/administracion/logros', adminAchievementsRoutes);

const apiRouter = require('./routes/api');
app.use('/api', apiRouter);

const recipesRouter = require('./routes/recipes');
app.use('/', recipesRouter);

const pagesRouter = require('./routes/pages');
app.use('/', pagesRouter);

app.get('/health', (req, res) => res.status(200).json({ ok: true }));

app.use((req, res) => {
    return res.redirect('/error');
});

app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));