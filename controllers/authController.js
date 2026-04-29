/**
 * =============================================================
 *  Controlador de Autenticación y Administración de Usuarios
 * =============================================================
 *  Descripción:
 *    - Gestiona el registro, inicio/cierre de sesión, perfil y avatar de usuarios.
 *    - Proporciona endpoints para administración de usuarios, recetas, reportes, logros y comentarios.
 *    - Incluye validaciones de datos, filtros de palabras prohibidas y control de acceso por tipo de usuario.
 *
 *  Rutas principales:
*    - POST   /registro                Registro de usuario
*    - POST   /iniciar-sesion          Inicio de sesión
*    - POST   /cerrar-sesion           Cierre de sesión
 *    - GET    /api/usuario             Perfil autenticado
*    - POST   /actualizar-perfil       Actualización de perfil
*    - POST   /subir-avatar            Subida de avatar
*    - POST   /eliminar-cuenta         Eliminación de cuenta
*    - GET    /api/administracion/usuarios           Listado de usuarios (admin)
*    - PUT    /api/administracion/usuarios/:id       Edición de usuario (admin)
*    - DELETE /api/administracion/usuarios/:id       Eliminación de usuario (admin)
*    - GET    /api/administracion/recetas            Listado de recetas (admin)
*    - PUT    /api/administracion/recetas/:id        Edición de receta (admin)
*    - DELETE /api/administracion/recetas/:id        Eliminación de receta (admin)
 *    - Otros endpoints de administración: reportes, comentarios, categorías, tipos, logros
 *    - GET    /api/usuario/estadisticas Estadísticas del usuario
 * 
 *
 *  Dependencias:
 *    - express, bcrypt, crypto, path, fs
 *    - authModel, userModel, profanityFilter, recipeImageStorage
 *    - Firebase admin opcional
 *
 *  Notas de seguridad y validación:
 *    - Validación estricta de datos en registro y edición (nombre, alias, teléfono, fechas, etc.)
 *    - Filtro de palabras prohibidas en campos sensibles
 *    - Control de acceso por tipo de usuario (administrador vs. usuario normal)
 *    - Manejo de transacciones en operaciones críticas (eliminación, edición masiva)
 *    - Respuestas y mensajes de error en español
 */
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const authModelCore = require('../models/authModel');
const recipesModel = require('../models/recipesModel');
const authModel = { ...recipesModel, ...authModelCore };
const userModel = require('../models/userModel');
const profanityFilter = require('../config/profanityFilter');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const {
  saveRecipeImageFromDataUrl,
  saveCategoryImageFromDataUrl,
  deleteCategoryImage,
  MAX_IMAGES_PER_RECIPE,
} = require('../utils/recipeImageStorage');
const DEFAULT_CATEGORY_IMAGE = '/Imagenes/Recetas/1.png';
const { Buffer } = require('buffer');
const PROJECT_ROOT = path.join(__dirname, '..');
const USER_IMAGES_DIR = path.join(PROJECT_ROOT, 'Imagenes', 'Usuarios');
const DEFAULT_USER_IMAGE_FILENAME = '0.png';

const ensureUserImagesDir = async () => {
  try {
    await fs.promises.mkdir(USER_IMAGES_DIR, { recursive: true });
  } catch (err) {
    if (!err || err.code !== 'EEXIST') {
      throw err;
    }
  }
};

// Firebase admin (para crear usuarios en Firebase desde el servidor)
let firebaseAdmin = null;
try {
  firebaseAdmin = require('../config/firebase').admin;
} catch (e) {
  // Si no está configurado, lo dejamos en null y procedemos solo con BD
  console.debug('Firebase admin no disponible:', e && e.message ? e.message : e);
}

// Límite global para imágenes de perfil en formato base64
const LIMITE_BYTES_IMAGEN = 8 * 1024 * 1024;

const resolverNombreBaseDatos = () => {
  const config = authModel.obtenerConfiguracionPool();
  return (config && config.database) || process.env.DB_NAME || 'recetas';
};

const normalizeDbBinaryFlag = (value) => {
  if (value === null || typeof value === 'undefined') return 0;
  if (Buffer.isBuffer(value)) return value.length > 0 && value[0] ? 1 : 0;
  if (typeof value === 'number') return value === 0 ? 0 : 1;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const lower = trimmed.toLowerCase();
    if (['1', 'true', 'si', 'sí', 'activo', 'activa'].includes(lower)) return 1;
    if (['0', 'false', 'no', 'inactivo', 'inactiva'].includes(lower)) return 0;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? 0 : (parsed === 0 ? 0 : 1);
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
};

// Utilidades generales para reutilizar lógica
const analizarCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return Object.fromEntries(cookieHeader.split(';').map(s => {
    const [k, ...v] = s.split('=');
    return [k.trim(), v.join('=').trim()];
  }));
};

let reportesSchemaCache = null;
const obtenerEsquemaReportes = async () => {
  if (reportesSchemaCache) return reportesSchemaCache;
  try {
    const dbName = resolverNombreBaseDatos();
    const rows = await authModel.obtenerColumnasReportes(dbName);
    const names = new Set((rows || []).map((row) => row.columnName));
    reportesSchemaCache = {
      columns: names,
      hasLegacy: names.has('rep_tipo') && names.has('rep_id_obj'),
      hasNew: names.has('rep_tipo_obj') && names.has('rep_obj_id'),
    };
  } catch (err) {
    console.warn('No se pudo obtener el esquema de la tabla reportes:', err && err.message ? err.message : err);
    reportesSchemaCache = {
      columns: new Set(['rep_tipo_obj', 'rep_obj_id', 'rep_fecha_rea']),
      hasLegacy: false,
      hasNew: true,
    };
  }
  return reportesSchemaCache;
};

const resolverColumnasReportes = async () => {
  const schema = await obtenerEsquemaReportes();
  const columns = schema.columns || new Set();
  return {
    tipoColumn: columns.has('rep_tipo_obj') ? 'Rep_Tipo_Obj' : (columns.has('rep_tipo') ? 'Rep_Tipo' : 'Rep_Tipo_Obj'),
    objetoColumn: columns.has('rep_obj_id') ? 'Rep_Obj_ID' : (columns.has('rep_id_obj') ? 'Rep_ID_Obj' : 'Rep_Obj_ID'),
    fechaColumn: columns.has('rep_fecha_rea') ? 'Rep_Fecha_Rea' : (columns.has('rep_fecha') ? 'Rep_Fecha' : 'Rep_Fecha_Rea')
  };
};

// Ayuda para determinar si la sesión actual pertenece a un usuario administrador.
const esSesionAdmin = async (req) => {
  if (!req.session || !req.session.user) return false;
  const cachedTipo = req.session.user.Tipo_Usu_ID
  let Tipo_Usu_ID = Number(cachedTipo);

  if (!Number.isInteger(Tipo_Usu_ID)) {
    try {
      const userId = req.session.user.id;
      if (!userId) return false;
      const tipoRow = await authModel.obtenerTipoUsuarioPorId(userId);
      if (tipoRow && typeof tipoRow.Tipo_Usu_ID !== 'undefined') {
        Tipo_Usu_ID = Number(tipoRow.Tipo_Usu_ID);
        if (req.session.user) {
          req.session.user.Tipo_Usu_ID = Tipo_Usu_ID;
        }
      }
    } catch (err) {
      console.warn('esSesionAdmin: no se pudo obtener Tipo_Usu_ID de la BD', err && err.message ? err.message : err);
      return false;
    }
  }

  return Tipo_Usu_ID === 1;
};

// Extrae el identificador de usuario disponible en la petición
const obtenerIdUsuarioDeReq = (req) => {
  if (req.session && req.session.user && req.session.user.id) return req.session.user.id;
  const cookieHeader = req.headers && req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = analizarCookies(cookieHeader);
  if (!cookies.userInfo) return null;
  try {
    const u = JSON.parse(decodeURIComponent(cookies.userInfo));
    if (u && u.id) return u.id;
  } catch (e) { }
  return null;
};

// Normaliza la ruta de la fotografía de perfil a un formato servible
const normalizarRutaFoto = (rawFoto) => {
  const fileExists = p => { try { return fs.existsSync(p); } catch { return false; } };
  let foto = rawFoto ? String(rawFoto).trim() : '';
  if (!foto) return '/Imagenes/default-profile.png';
  if (path.isAbsolute(foto)) {
    const relative = path.relative(PROJECT_ROOT, foto).split(path.sep).join('/');
    const candidate = path.join(PROJECT_ROOT, relative);
    return fileExists(candidate) ? '/' + relative.replace(/^\/+/, '') : '/Imagenes/default-profile.png';
  }
  const candidate = path.join(PROJECT_ROOT, foto.replace(/^\/+/, ''));
  return fileExists(candidate) ? '/' + foto.replace(/^\/+/, '').split(path.sep).join('/') : '/Imagenes/default-profile.png';
};

const normalizarRutaPublica = (rawPath, fallback = '/Imagenes/Recetas/1.png') => {
  if (!rawPath) return fallback;
  const trimmed = String(rawPath).trim();
  if (!trimmed) return fallback;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed.replace(/^\/+/, '')}`;
};

const ensurePublicAssetPath = (rawPath, fallback = null) => {
  if (!rawPath || typeof rawPath !== 'string') return fallback;
  const trimmed = rawPath.trim();
  if (!trimmed) return fallback;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed.replace(/^\/+/,'')}`;
};

const analizarIndiceImagenReceta = (relativePath) => {
  if (!relativePath || typeof relativePath !== 'string') return null;
  const fileName = relativePath.split('/').pop();
  if (!fileName) return null;
  const match = fileName.match(/^\d+(?:\.(\d+))?\.[^.]+$/);
  if (!match) return null;
  if (!match[1]) return 0;
  const numericIndex = Number.parseInt(match[1], 10);
  return Number.isFinite(numericIndex) ? numericIndex : null;
};

const MAX_RECIPE_IMAGES = MAX_IMAGES_PER_RECIPE;

const normalizeRecipeImageDiskPath = (rawPath) => {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const trimmed = rawPath.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return null;
  if (trimmed === 'Imagenes/Recetas/0.png') return null;
  const relative = trimmed.replace(/^\/+/,'');
  if (!relative) return null;
  return path.join(PROJECT_ROOT, relative.split('/').join(path.sep));
};

const deleteRecipeImageFileIfExists = async (rawPath) => {
  const diskPath = normalizeRecipeImageDiskPath(rawPath);
  if (!diskPath) return;
  try {
    await fs.promises.unlink(diskPath);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn('No se pudo eliminar la imagen de receta:', diskPath, err && err.message ? err.message : err);
    }
  }
};

const removeRecipeImageFiles = async (rowsOrPaths = []) => {
  if (!Array.isArray(rowsOrPaths) || !rowsOrPaths.length) return;
  const candidates = rowsOrPaths
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') return entry;
      if (entry.Img_Rutas) return entry.Img_Rutas;
      if (entry.img_rutas) return entry.img_rutas;
      if (entry.ruta) return entry.ruta;
      if (entry.url && !/^https?:\/\//i.test(entry.url)) {
        return entry.url;
      }
      return null;
    })
    .filter(Boolean);
  if (!candidates.length) return;
  const uniqueCandidates = [...new Set(candidates)];
  await Promise.allSettled(uniqueCandidates.map((candidate) => deleteRecipeImageFileIfExists(candidate)));
};

const obtenerImagenesReceta = async (recipeId) => {
  const imgRows = await authModel.obtenerImagenesReceta(recipeId);
  return (imgRows || []).map((img) => ({
    id: img.Img_ID,
    url: normalizarRutaFoto(img.Img_Rutas)
  }));
};

const encontrarUsuarioPorIdentificador = userModel.buscarPorIdentificador;

const DORMANT_RETENTION_DAYS = 14;
const DORMANT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const DORMANT_AUTOCLEAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastDormantCleanupRun = 0;

const purgeDormantUsers = async (maxDays = DORMANT_RETENTION_DAYS) => {
  try {
    await authModel.backfillRetencionUsuarios();
    const expiredEntries = await authModel.obtenerRetencionesExpiradas(maxDays);
    if (!Array.isArray(expiredEntries) || !expiredEntries.length) {
      return { removed: 0 };
    }
    let removed = 0;
    for (const entry of expiredEntries) {
      let connection = null;
      let transactionStarted = false;
      try {
        connection = await authModel.obtenerConexion();
        await connection.beginTransaction();
        transactionStarted = true;

        const target = await authModel.obtenerUsuarioParaEliminacion(connection, entry.Usu_ID);
        if (!target || Number(target.Tipo_Usu_ID) === 1) {
          await connection.rollback();
          transactionStarted = false;
          await authModel.limpiarRetencionUsuario(entry.Usu_ID, entry.condicion);
          continue;
        }

        const recipeRows = await authModel.obtenerIdsRecetasPorUsuario(connection, entry.Usu_ID);
        const recipeIds = (recipeRows || []).map((row) => row.Rec_ID);
        if (recipeIds.length > 0) {
          await authModel.eliminarDependenciasRecetas(connection, recipeIds);
        }

        await authModel.eliminarRelacionesUsuario(connection, entry.Usu_ID);
        await authModel.eliminarUsuarioPorId(connection, entry.Usu_ID);

        await connection.commit();
        transactionStarted = false;
        removed += 1;
        await authModel.limpiarRetencionUsuario(entry.Usu_ID, entry.condicion);
      } catch (err) {
        if (connection && transactionStarted) {
          try {
            await connection.rollback();
          } catch (rollbackErr) {
            console.error('purgeDormantUsers: rollback falló', rollbackErr && rollbackErr.message ? rollbackErr.message : rollbackErr);
          }
        }
        console.error('purgeDormantUsers: error al eliminar usuario', entry && entry.Usu_ID, err && err.message ? err.message : err);
      } finally {
        if (connection) connection.release();
      }
    }
    if (removed > 0) {
      console.info(`purgeDormantUsers: ${removed} usuario(s) eliminados tras ${maxDays} días inactivo o sin verificar.`);
    }
    return { removed };
  } catch (err) {
    console.error('purgeDormantUsers: error general', err && err.message ? err.message : err);
    return { removed: 0 };
  }
};

const triggerDormantUsersCleanup = async () => {
  const now = Date.now();
  if (now - lastDormantCleanupRun < DORMANT_CLEANUP_INTERVAL_MS) {
    return;
  }
  lastDormantCleanupRun = now;
  await purgeDormantUsers();
};

try {
  const dormantCleanupInterval = setInterval(() => {
    purgeDormantUsers().catch((err) => {
      console.error('dormantCleanupInterval: error ejecutando limpieza programada', err && err.message ? err.message : err);
    });
  }, DORMANT_AUTOCLEAN_INTERVAL_MS);
  if (typeof dormantCleanupInterval.unref === 'function') {
    dormantCleanupInterval.unref();
  }
} catch (intervalErr) {
  console.warn('No se pudo iniciar el temporizador de limpieza de usuarios inactivos:', intervalErr && intervalErr.message ? intervalErr.message : intervalErr);
}

// Gestiona el registro de nuevos usuarios
router.post('/registro', async (req, res) => {
  try {
    const { nombre, email, password, alias, Usu_Cum, genero, agreePrivacy, agreeTerms } = req.body;
    const phone = String(req.body.Usu_Telefono || '').trim();

    if (!phone) {
      return res.send('<h2>El teléfono es obligatorio</h2><a href="/registro">Volver</a>');
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (!/^\d{10}$/.test(phoneDigits)) {
      return res.send('<h2>El teléfono debe contener exactamente 10 dígitos</h2><a href="/registro">Volver</a>');
    }
    if (!nombre || !email || !password) {
      return res.send('<h2>Faltan datos requeridos</h2><a href="/registro">Volver</a>');
    }
    if (!agreePrivacy || !agreeTerms) {
      return res.send('<h2>Debes aceptar la Política de Privacidad y los Términos</h2><a href="/registro">Volver</a>');
    }
    const rawName = String(nombre || '').trim();
    const profaneName = profanityFilter.containsProfanity(rawName);
    if (profaneName) {
      return res.send('<h2>El nombre contiene palabras no permitidas</h2><a href="/registro">Volver</a>');
    }
    if (rawName.length < 20 || rawName.length > 150) {
      return res.send('<h2>El nombre debe tener entre 20 y 150 caracteres</h2><a href="/registro">Volver</a>');
    }
    if (!/^[\p{L} ]+$/u.test(rawName)) {
      return res.send('<h2>El nombre solo puede contener letras y espacios</h2><a href="/registro">Volver</a>');
    }
    const rawAlias = String(alias || '').trim();
    if (!/^[A-Za-z0-9]{6,19}$/.test(rawAlias)) {
      return res.send('<h2>Alias inválido. Debe tener entre 6 y 19 caracteres alfanuméricos.</h2><a href="/registro">Volver</a>');
    }
    if (profanityFilter.containsProfanity(rawAlias)) {
      return res.send('<h2>El alias contiene palabras no permitidas</h2><a href="/registro">Volver</a>');
    }
    if (!Usu_Cum) {
      return res.send('<h2>La fecha de nacimiento es obligatoria</h2><a href="/registro">Volver</a>');
    }
    const birth = new Date(Usu_Cum);
    if (isNaN(birth.getTime())) {
      return res.send('<h2>Fecha de nacimiento inválida</h2><a href="/registro">Volver</a>');
    }
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    if (age < 18) return res.send('<h2>Debes ser mayor de 18 años para registrarte</h2><a href="/registro">Volver</a>');
    if (age > 150) return res.send('<h2>Fecha de nacimiento inválida (más de 150 años)</h2><a href="/registro">Volver</a>');
    let genChar = null;
    if (genero) {
      const g = String(genero).toLowerCase();
      if (g === 'masculino' || g === 'm') genChar = 'M';
      else if (g === 'femenino' || g === 'f') genChar = 'F';
      else genChar = 'O';
    }
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 20) {
        return res.send('<h2>El número de teléfono no es válido</h2><a href="/regiregisterstro">Volver</a>');
      }
    }
    const emailExists = await authModel.existeUsuarioPorEmail(email);
    if (emailExists) {
      return res.send('<h2>El correo ya está registrado</h2><a href="/registro">Volver</a>');
    }
    const dbName = resolverNombreBaseDatos();
    const cols = await authModel.obtenerNombresColumnasUsuarios(dbName);
    const existing = new Set(cols.map(c => c.COLUMN_NAME));
    if (existing.has('Usu_Alias')) {
      const aliasRow = await authModel.buscarUsuarioIdPorAlias(rawAlias);
      if (aliasRow) return res.send('<h2>El alias ya está en uso</h2><a href="/registro">Volver</a>');
    }
    if (existing.has('Usu_Telefono')) {
      const phoneRow = await authModel.buscarUsuarioIdPorTelefono(phoneDigits);
      if (phoneRow) return res.send('<h2>El número de teléfono ya está en uso</h2><a href="/registro">Volver</a>');
    }

    const hash = await bcrypt.hash(password, 10);
    const currentMax = await authModel.obtenerMaximoUsuarioId();
    const nextId = currentMax + 1;
    const colInfos = await authModel.obtenerInfoColumnasUsuarios(dbName);
    const colInfoMap = Object.fromEntries(colInfos.map(c => [c.COLUMN_NAME, c]));
    const colsToInsert = ['Usu_ID', 'Usu_Nombre', 'Usu_Email', 'Usu_Contraseña'];
    const placeholders = ['?', '?', '?', '?'];
    const values = [nextId, nombre, email, hash];
    const defaultFor = (info) => {
      const name = info.COLUMN_NAME;
      const dtype = (info.DATA_TYPE || '').toLowerCase();
      if (name === 'Usu_Alias') return rawAlias || '';
      if (name === 'Usu_Cum') return Usu_Cum || (new Date()).toISOString().slice(0, 10);
      if (name === 'Usu_Genero') return genChar || 'O';
      if (name === 'Usu_Telefono') return phoneDigits || '';
      if (name === 'Usu_Activo') return Buffer.from([1]);
      if (dtype === 'bit') return Buffer.from([0]);
      if (dtype === 'date' || dtype === 'datetime' || dtype === 'timestamp') return Usu_Cum || (new Date()).toISOString().slice(0, 10);
      if (dtype.includes('int') || dtype === 'tinyint' || dtype === 'smallint' || dtype === 'bigint' || dtype === 'decimal' || dtype === 'float' || dtype === 'double') return 0;
      return '';
    };

    for (const info of colInfos) {
      const name = info.COLUMN_NAME;
      if (colsToInsert.includes(name)) continue;
      if ((info.EXTRA || '').toLowerCase().includes('auto_increment')) continue;
      if (info.IS_NULLABLE === 'NO' && (info.COLUMN_DEFAULT === null || typeof info.COLUMN_DEFAULT === 'undefined')) {
        colsToInsert.push(name);
        placeholders.push('?');
        values.push(defaultFor(info));
      }
    }

    console.debug('Registro - nombre(normalizado)=', rawName, 'phone=', phone, 'INSERT columnas:', colsToInsert, values);

    // Si tenemos Firebase admin configurado, intentamos crear el usuario en Firebase
    let createdFirebaseUid = null;
    if (firebaseAdmin) {
      try {
        const userRecord = await firebaseAdmin.auth().createUser({
          email: email,
          password: password,
          displayName: rawName || undefined,
          disabled: false
        });
        createdFirebaseUid = userRecord.uid;
        console.debug('Usuario creado en Firebase uid=', createdFirebaseUid);
      } catch (fbErr) {
        console.error('Error creando usuario en Firebase:', fbErr);
        // Si Firebase falla con error de usuario existente, devolver mensaje claro
        const errMsg = (fbErr && fbErr.message) ? fbErr.message : 'Error creando usuario en Firebase';
        return res.send(`<h2>${String(errMsg)}</h2><a href="/registro">Volver</a>`);
      }
    }

    try {
      await authModel.insertarUsuario(colsToInsert, values);
    } catch (dbErr) {
      console.error('Error insertando usuario en BD:', dbErr);
      // Si ya creamos en Firebase, intentar eliminarlo para evitar usuarios huérfanos
      if (createdFirebaseUid && firebaseAdmin) {
        try {
          await firebaseAdmin.auth().deleteUser(createdFirebaseUid);
          console.debug('Usuario Firebase eliminado por rollback uid=', createdFirebaseUid);
        } catch (delErr) {
          console.error('Error eliminando usuario Firebase tras fallo BD:', delErr);
        }
      }
      return res.status(500).send('<h2>Error interno</h2><a href="/registro">Volver</a>');
    }

    try {
      await authModel.registrarRetencionUsuario(nextId, 'no_verificado');
    } catch (retentionErr) {
      console.warn('No se pudo registrar el temporizador de verificación para el usuario', nextId, retentionErr && retentionErr.message ? retentionErr.message : retentionErr);
    }

    return res.redirect('/');
  } catch (err) {
    console.error('Error en /registro:', err);
    return res.status(500).send('<h2>Error interno</h2><a href="/registro">Volver</a>');
  }
});

// Gestiona el inicio de sesión de usuarios
const procesarInicioSesion = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await authModel.buscarUsuarioConTipoPorEmail(email);
    if (!user) {
      return res.redirect('/iniciar-sesion');
    }
    const match = await bcrypt.compare(password, user.Usu_Contraseña);

    if (match) {
      if (firebaseAdmin) {
        try {
          const firebaseRecord = await firebaseAdmin.auth().getUserByEmail(email);
          if (firebaseRecord && !firebaseRecord.emailVerified) {
            try {
              await firebaseAdmin.auth().generateEmailVerificationLink(email);
            } catch (linkErr) {
              console.warn('authController /iniciar-sesion: no se pudo generar el enlace de verificación', linkErr && linkErr.message ? linkErr.message : linkErr);
            }
            req.session.user = null;
            return res.redirect('/iniciar-sesion?error=' + encodeURIComponent('Debes verificar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada o solicita un nuevo enlace.'));
          }
        } catch (firebaseErr) {
          console.warn('authController /iniciar-sesion: no se pudo obtener el usuario de Firebase', firebaseErr && firebaseErr.message ? firebaseErr.message : firebaseErr);
        }
      }

      req.session.user = {
        id: user.Usu_ID,
        nombre: user.Usu_Nombre,
        email: user.Usu_Email,
        Tipo_Usu_ID: user.Tipo_Usu_ID,
        tipoNombre: user.Tipo_Nombre
      };

      try {
        const tipoNumeric = Number(user.Tipo_Usu_ID);
        const cookiePayload = {
          nombre: user.Usu_Nombre,
          id: user.Usu_ID,
        };
        if (Number.isFinite(tipoNumeric)) {
          cookiePayload.Tipo_Usu_ID = tipoNumeric;
        }
        res.cookie('userInfo', JSON.stringify(cookiePayload), { httpOnly: false });
      } catch (cookieErr) {
        console.warn('authController /iniciar-sesion: no se pudo establecer la cookie userInfo', cookieErr && cookieErr.message ? cookieErr.message : cookieErr);
      }

      req.session.save((saveErr) => {
        if (saveErr) console.error('Error guardando sesión después del inicio de sesión:', saveErr);
        else console.debug('Sesión guardada para el usuario', user.Usu_ID);
      });

      const redirectPath = Number(user.Tipo_Usu_ID) === 1 ? '/administracion' : '/inicio';
      return res.redirect(redirectPath);
    }

    return res.redirect('/iniciar-sesion');
  } catch (err) {
    console.error(err);
    return res.redirect('/iniciar-sesion');
  }
};

router.post('/iniciar-sesion', procesarInicioSesion);

// Gestiona el cierre de sesión y limpieza de recursos
const procesarCierreSesion = async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      res.clearCookie('userInfo');
      res.clearCookie('connect.sid', { path: '/' });
      return res.redirect('/');
    }

    const userId = req.session.user.id;
    console.log('Solicitud de cierre de sesión para userId=', userId);

    res.clearCookie('userInfo');
    res.clearCookie('connect.sid', { path: '/' });

    req.session.destroy((err) => {
      if (err) {
        console.error('Error destruyendo sesión:', err);
      }
      return res.redirect('/');
    });
  } catch (err) {
    console.error('Error al cerrar sesión:', err);
    return res.redirect('/');
  }
};

router.post('/cerrar-sesion', procesarCierreSesion);

// API de administración: lista todos los usuarios registrados, excepto otros administradores (Tipo_Usu_ID = 1)
router.get('/api/administracion/usuarios', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await triggerDormantUsersCleanup();

    const rows = await authModel.obtenerUsuariosNoAdminConTipo();

    const data = (rows || []).map((u) => {
      const estado = normalizeDbBinaryFlag(u.Usu_Activo ?? u.estado ?? u.Usu_Estado ?? u.activo);
      return {
        id: u.Usu_ID,
        nombre: u.Usu_Nombre,
        email: u.Usu_Email,
        Tipo_Usu_ID: u.Tipo_Usu_ID,
        tipoId: u.Tipo_Usu_ID,
        tipoNombre: u.Tipo_Nombre,
        fechaRegistro: u.Usu_Fecha_Registro,
        estado,
        Usu_Activo: estado,
      };
    });

    return res.json(data);
  } catch (err) {
    console.error('Error en GET /api/administracion/usuarios:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});


// API de administración: obtener perfil de administrador actual
router.get('/api/administracion/perfil-sesion', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await triggerDormantUsersCleanup();

    const userId = Number(req.session.user.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const profile = await authModel.obtenerPerfilUsuarioPorId(userId);

    if (!profile) {
      return res.status(404).json({ error: 'Administrador no encontrado' });
    }
    return res.json({
      id: userId,
      nombre: profile.Usu_Nombre || '',
      email: profile.Usu_Email || '',
      fotoUrl: normalizarRutaFoto(profile.Usu_Foto)
    });
  } catch (err) {
    console.error('Error en GET /api/administracion/perfil-sesion:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});


// API de administración: lista de tipos de usuarios disponibles (excluyendo al administrador) para editar.
router.get('/api/administracion/tipos-usuario', async (req, res) => {
  try {
    const admin = await esSesionAdmin(req);
    if (!admin) return res.status(403).json({ error: 'No autorizado' });

    const rows = await authModel.obtenerTiposUsuarioExcluyendoAdmin();
    return res.json(rows || []);
  } catch (err) {
    console.error('Error en GET /api/administracion/tipos-usuario:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});


// API de administración: recuperar todos los detalles de un usuario específico que no sea administrador.
router.get('/api/administracion/usuarios/:id', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await triggerDormantUsersCleanup();

    const userId = parseInt(req.params.id, 10);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const userRow = await authModel.obtenerDetalleUsuarioPorId(userId);

    if (!userRow) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (Number(userRow.Tipo_Usu_ID) === 1) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const estado = normalizeDbBinaryFlag(
      userRow.Usu_Activo ?? userRow.estado ?? userRow.Usu_Estado ?? userRow.activo
    );

    const detail = {
      id: userRow.Usu_ID,
      nombre: userRow.Usu_Nombre || '',
      email: userRow.Usu_Email || '',
      alias: userRow.Usu_Alias || '',
      telefono: userRow.Usu_Telefono || '',
      Tipo_Usu_ID: userRow.Tipo_Usu_ID,
      tipoId: userRow.Tipo_Usu_ID,
      tipoNombre: userRow.Tipo_Nombre,
      biografia: userRow.Usu_Biografia || '',
      fechaRegistro: userRow.Usu_Fecha_Registro,
      genero: userRow.Usu_Genero || '',
      fechaNacimiento: userRow.Usu_Cum || null,
      alergiaId: userRow.Ale_ID || null,
      estado,
      Usu_Activo: estado,
      foto: normalizarRutaFoto(userRow.Usu_Foto)
    };

    return res.json(detail);
  } catch (err) {
    console.error('Error en GET /api/administracion/usuarios/:id:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});


// API de administración: actualizar un usuario específico no administrador
router.put('/api/administracion/usuarios/:id', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const userId = parseInt(req.params.id, 10);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const current = await authModel.obtenerUsuarioBasicoPorId(userId);
    if (!current) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (Number(current.Tipo_Usu_ID) === 1) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const {
      nombre,
      email,
      alias,
      telefono,
      tipoId,
      biografia,
      estado
    } = req.body || {};

    const updates = [];
    const values = [];

    if (typeof nombre === 'string') {
      const trimmed = nombre.trim();
      if (!trimmed) return res.status(400).json({ error: 'El nombre es requerido' });
      if (profanityFilter.containsProfanity(trimmed)) {
        return res.status(400).json({ error: 'El nombre contiene palabras no permitidas' });
      }
      updates.push('Usu_Nombre = ?');
      values.push(trimmed);
    }

    if (typeof email === 'string') {
      const trimmed = email.trim();
      if (!trimmed) return res.status(400).json({ error: 'El correo es requerido' });
      const emailTaken = await authModel.existeEmailParaOtroUsuario(trimmed, userId);
      if (emailTaken) {
        return res.status(400).json({ error: 'El correo ya está en uso por otro usuario' });
      }
      updates.push('Usu_Email = ?');
      values.push(trimmed);
    }

    if (typeof alias === 'string') {
      const trimmed = alias.trim();
      if (!/^[A-Za-z0-9]{3,20}$/.test(trimmed)) {
        return res.status(400).json({ error: 'El alias debe tener entre 3 y 20 caracteres alfanuméricos' });
      }
      if (profanityFilter.containsProfanity(trimmed)) {
        return res.status(400).json({ error: 'El alias contiene palabras no permitidas' });
      }
      const aliasTaken = await authModel.existeAliasParaOtroUsuario(trimmed, userId);
      if (aliasTaken) {
        return res.status(400).json({ error: 'El alias ya está en uso por otro usuario' });
      }
      updates.push('Usu_Alias = ?');
      values.push(trimmed);
    }

    if (typeof telefono === 'string') {
      const digits = telefono.replace(/\D/g, '');
      if (digits && digits.length !== 10) {
        return res.status(400).json({ error: 'El teléfono debe contener 10 dígitos' });
      }
      updates.push('Usu_Telefono = ?');
      values.push(digits);
    }

    if (typeof biografia === 'string') {
      const trimmed = biografia.length > 255 ? biografia.slice(0, 255) : biografia;
      if (trimmed && profanityFilter.containsProfanity(trimmed)) {
        return res.status(400).json({ error: 'La biografía contiene palabras no permitidas' });
      }
      updates.push('Usu_Biografia = ?');
      values.push(trimmed);
    }

    if (typeof tipoId !== 'undefined') {
      const parsedTipo = parseInt(tipoId, 10);
      if (!Number.isInteger(parsedTipo) || parsedTipo === 1) {
        return res.status(400).json({ error: 'Tipo de usuario inválido' });
      }
      const tipoExists = await authModel.existeTipoUsuarioEditable(parsedTipo);
      if (!tipoExists) {
        return res.status(400).json({ error: 'Tipo de usuario no encontrado' });
      }
      updates.push('Tipo_Usu_ID = ?');
      values.push(parsedTipo);
    }

    let estadoCambio = null;
    if (typeof estado !== 'undefined') {
      const parsedEstado = Number(estado);
      if (!Number.isInteger(parsedEstado) || (parsedEstado !== 0 && parsedEstado !== 1)) {
        return res.status(400).json({ error: 'Estado inválido' });
      }
      estadoCambio = parsedEstado;
      updates.push('Usu_Activo = ?');
      values.push(parsedEstado);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No se recibieron cambios' });
    }

    await authModel.actualizarUsuarioPorId(userId, updates, values);

    if (estadoCambio !== null) {
      try {
        if (estadoCambio === 0) {
          await authModel.registrarRetencionUsuario(userId, 'inactivo');
        } else {
          await authModel.limpiarRetencionUsuario(userId, 'inactivo');
        }
      } catch (retentionErr) {
        console.warn('No se pudo actualizar el temporizador de inactividad para el usuario', userId, retentionErr && retentionErr.message ? retentionErr.message : retentionErr);
      }
    }

    const updatedUser = await authModel.obtenerUsuarioConTipoPorId(userId);

    if (firebaseAdmin && estadoCambio !== null) {
      try {
        const targetEmail = (updatedUser && updatedUser.Usu_Email) || current.Usu_Email;
        if (targetEmail) {
          const firebaseRecord = await firebaseAdmin.auth().getUserByEmail(targetEmail);
          await firebaseAdmin.auth().updateUser(firebaseRecord.uid, { disabled: estadoCambio === 1 ? false : true });
        }
      } catch (firebaseErr) {
        console.warn('No se pudo sincronizar estado en Firebase:', firebaseErr && firebaseErr.message ? firebaseErr.message : firebaseErr);
      }
    }

    return res.json({
      ok: true,
      user: updatedUser ? {
        id: updatedUser.Usu_ID,
        nombre: updatedUser.Usu_Nombre,
        email: updatedUser.Usu_Email,
        alias: updatedUser.Usu_Alias,
        telefono: updatedUser.Usu_Telefono,
        Tipo_Usu_ID: updatedUser.Tipo_Usu_ID,
        tipoId: updatedUser.Tipo_Usu_ID,
        tipoNombre: updatedUser.Tipo_Nombre,
        biografia: updatedUser.Usu_Biografia,
        foto: normalizarRutaFoto(updatedUser.Usu_Foto),
        estado: typeof updatedUser.Usu_Activo !== 'undefined'
          ? Number(updatedUser.Usu_Activo)
          : Number(updatedUser.Usu_Activo ?? 0)
      } : null
    });
  } catch (err) {
    console.error('Error en PUT /api/administracion/usuarios/:id:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});


// API de administración: eliminar un usuario específico que no sea administrador y los datos relacionados.
router.delete('/api/administracion/usuarios/:id', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  let connection = null;
  let transactionStarted = false;

  try {
    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const userId = parseInt(req.params.id, 10);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    if (req.session.user && Number(req.session.user.id) === userId) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    }

    connection = await authModel.obtenerConexion();
    await connection.beginTransaction();
    transactionStarted = true;

    const target = await authModel.obtenerUsuarioParaEliminacion(connection, userId);
    if (!target) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (Number(target.Tipo_Usu_ID) === 1) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(403).json({ error: 'No autorizado' });
    }

    const recipeRows = await authModel.obtenerIdsRecetasPorUsuario(connection, userId);
    const recipeIds = (recipeRows || []).map(r => r.Rec_ID);

    if (recipeIds.length > 0) {
      await authModel.eliminarDependenciasRecetas(connection, recipeIds);
    }

    await authModel.eliminarRelacionesUsuario(connection, userId);

    await authModel.eliminarUsuarioPorId(connection, userId);

    await connection.commit();
    transactionStarted = false;

    return res.json({ ok: true });
  } catch (err) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error('Error al hacer rollback en DELETE /api/administracion/usuarios/:id:', rollbackErr);
      }
    }
    console.error('Error en DELETE /api/administracion/usuarios/:id:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno al eliminar usuario' });
  } finally {
    if (connection) connection.release();
  }
});


// API de administración: lista de recetas con información sobre el autor y la categoría.
router.get('/api/administracion/recetas', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

        const rows = await authModel.obtenerRecetasAdministracion();

        const data = (rows || []).map((r) => ({
      id: r.Rec_ID,
      titulo: r.Rec_Nombre || '',
      fechaPublicacion: r.Rec_Fecha_Publicacion,
      dificultad: r.Rec_Dificultad,
      tiempoPrep: r.Rec_Tiempo_Prep,
      autorId: r.Usu_ID,
      autorNombre: r.Usu_Nombre || '',
      categoriaId: r.Cat_ID,
      categoriaNombre: r.Cat_Nombre || ''
    }));

    return res.json(data);
  } catch (err) {
    console.error('Error en GET /api/administracion/recetas:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// API de administración: lista de reportes enviados por los usuarios
router.get('/api/administracion/reportes', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { tipoColumn, objetoColumn, fechaColumn } = await resolverColumnasReportes();

    const rows = await authModel.obtenerReportesAdministracion({ tipoColumn, objetoColumn, fechaColumn });

    const data = (rows || []).map((row) => {
      const tipo = row.tipoReporte || '';
      let objetoNombre = '';
      let enlaceAdmin = null;

      if (tipo === 'receta') {
        objetoNombre = row.recetaNombre || '';
        if (row.objetoId) enlaceAdmin = `/administracion/recetas/${encodeURIComponent(row.objetoId)}`;
      } else if (tipo === 'comentario') {
        objetoNombre = row.comentarioTexto || '';
        if (row.comentarioRecetaId) enlaceAdmin = `/administracion/recetas/${encodeURIComponent(row.comentarioRecetaId)}#comentario-${row.objetoId}`;
      } else if (tipo === 'usuario') {
        objetoNombre = row.usuarioReportadoNombre || row.usuarioReportadoAlias || '';
        if (row.objetoId) enlaceAdmin = `/administracion/usuarios/${encodeURIComponent(row.objetoId)}`;
      }

      return {
        id: row.Rep_ID,
        tipo,
        objetoId: row.objetoId,
        motivo: row.Rep_Motivo || '',
        fecha: row.fechaReporte,
        estado: row.Rep_Estado || 'pendiente',
        reportante: {
          id: row.Usu_ID,
          nombre: row.reportanteNombre || '',
          alias: row.reportanteAlias || '',
          email: row.reportanteEmail || ''
        },
        objetoNombre,
        enlaceAdmin
      };
    });

    return res.json(data);
  } catch (err) {
    console.error('Error en GET /api/administracion/reportes:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/api/administracion/reportes/:id', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const reportId = Number(req.params.id);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      return res.status(400).json({ error: 'reporte_invalido' });
    }

    const { tipoColumn, objetoColumn, fechaColumn } = await resolverColumnasReportes();
    const detail = await authModel.obtenerReporteAdministracionPorId({ reportId, tipoColumn, objetoColumn, fechaColumn });
    if (!detail) {
      return res.status(404).json({ error: 'reporte_no_encontrado' });
    }

    const aliasConArroba = (value) => {
      if (!value) return null;
      const trimmed = String(value).trim();
      if (!trimmed) return null;
      return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
    };

    const reportePayload = {
      id: detail.Rep_ID,
      motivo: detail.Rep_Motivo || '',
      estado: detail.Rep_Estado || 'pendiente',
      tipo: detail.tipoReporte || '',
      fecha: detail.fechaReporte,
      objetoId: detail.objetoId != null ? Number(detail.objetoId) : null
    };

    const reportantePayload = {
      id: detail.reportanteId || null,
      nombre: detail.reportanteNombre || '',
      alias: aliasConArroba(detail.reportanteAlias),
      email: detail.reportanteEmail || '',
      foto: ensurePublicAssetPath(detail.reportanteFoto, '/Imagenes/Usuarios/0.png')
    };

    const objetoPayload = { tipo: reportePayload.tipo, comentario: null, receta: null, usuario: null };

    if (reportePayload.tipo === 'comentario') {
      objetoPayload.comentario = {
        id: detail.comentarioId || null,
        texto: detail.comentarioTexto || '',
        recetaId: detail.comentarioRecetaId || null,
        autor: detail.comentarioAutorId ? {
          id: detail.comentarioAutorId,
          nombre: detail.comentarioAutorNombre || '',
          alias: aliasConArroba(detail.comentarioAutorAlias),
          email: detail.comentarioAutorEmail || ''
        } : null
      };
      if (detail.comentarioRecetaId) {
        objetoPayload.receta = {
          id: detail.comentarioRecetaId,
          titulo: detail.comentarioRecetaNombre || '',
          autor: detail.comentarioRecetaAutorId ? {
            id: detail.comentarioRecetaAutorId,
            nombre: detail.comentarioRecetaAutorNombre || '',
            alias: aliasConArroba(detail.comentarioRecetaAutorAlias)
          } : null
        };
      }
    } else if (reportePayload.tipo === 'receta') {
      objetoPayload.receta = {
        id: detail.recetaId || null,
        titulo: detail.recetaNombre || '',
        descripcion: detail.recetaDescripcion || '',
        categoriaId: detail.recetaCategoriaId || null,
        categoriaNombre: detail.recetaCategoriaNombre || '',
        tipoId: detail.recetaTipoId || null,
        tipoNombre: detail.recetaTipoNombre || '',
        dificultad: detail.recetaDificultad != null ? Number(detail.recetaDificultad) : null,
        tiempoPrep: detail.recetaTiempoPrep || null,
        porciones: detail.recetaPorciones != null ? Number(detail.recetaPorciones) : null,
        fechaPublicacion: detail.recetaFecha || null,
        imagenPrincipal: ensurePublicAssetPath(detail.recetaImagenPrincipal, '/Imagenes/Recetas/0.png'),
        autor: detail.recetaAutorId ? {
          id: detail.recetaAutorId,
          nombre: detail.recetaAutorNombre || '',
          alias: aliasConArroba(detail.recetaAutorAlias)
        } : null
      };
    } else if (reportePayload.tipo === 'usuario') {
      objetoPayload.usuario = {
        id: detail.usuarioObjetivoId || null,
        nombre: detail.usuarioObjetivoNombre || '',
        alias: aliasConArroba(detail.usuarioObjetivoAlias),
        email: detail.usuarioObjetivoEmail || '',
        foto: ensurePublicAssetPath(detail.usuarioObjetivoFoto, '/Imagenes/Usuarios/0.png'),
        tipoId: detail.usuarioObjetivoTipoId || null,
        tipoNombre: detail.usuarioObjetivoTipoNombre || '',
        activo: normalizeDbBinaryFlag(detail.usuarioObjetivoActivo) === 1,
        fechaRegistro: detail.usuarioObjetivoRegistro || null
      };
    }

    const stats = await authModel.obtenerResumenReportesPorObjeto({
      tipoColumn,
      objetoColumn,
      tipoReporte: reportePayload.tipo,
      objetoId: reportePayload.objetoId
    });

    const relacionadosRaw = await authModel.obtenerReportesRelacionados({
      tipoColumn,
      objetoColumn,
      fechaColumn,
      tipoReporte: reportePayload.tipo,
      objetoId: reportePayload.objetoId,
      excludeReportId: reportId,
      limit: 6
    });

    const relacionados = (relacionadosRaw || []).map((row) => ({
      id: row.Rep_ID,
      motivo: row.Rep_Motivo || '',
      estado: row.Rep_Estado || 'pendiente',
      fecha: row.fechaReporte,
      reportante: {
        nombre: row.reportanteNombre || '',
        alias: aliasConArroba(row.reportanteAlias)
      }
    }));

    const acciones = {
      puedeResolver: true,
      puedeDescartar: true,
      puedeReabrir: reportePayload.estado !== 'pendiente',
      puedeEliminarComentario: reportePayload.tipo === 'comentario' && Boolean(detail.comentarioId)
    };

    const links = { admin: { panel: '/administracion#reportes' } };
    if (objetoPayload.receta && objetoPayload.receta.id) {
      links.admin.receta = `/administracion/recetas/${encodeURIComponent(objetoPayload.receta.id)}`;
    }
    if (objetoPayload.comentario && objetoPayload.comentario.id) {
      links.admin.comentario = `/administracion/comentarios/${encodeURIComponent(objetoPayload.comentario.id)}`;
    }
    if (objetoPayload.usuario && objetoPayload.usuario.id) {
      links.admin.usuario = `/administracion/usuarios/${encodeURIComponent(objetoPayload.usuario.id)}`;
    }
    if (objetoPayload.comentario && objetoPayload.comentario.autor && objetoPayload.comentario.autor.id) {
      links.admin.autorComentario = `/administracion/usuarios/${encodeURIComponent(objetoPayload.comentario.autor.id)}`;
    }
    if (reportantePayload.id) {
      links.admin.reportante = `/administracion/usuarios/${encodeURIComponent(reportantePayload.id)}`;
    }

    return res.json({ reporte: reportePayload, reportante: reportantePayload, objeto: objetoPayload, stats, acciones, links, relacionados });
  } catch (err) {
    console.error('Error en GET /api/administracion/reportes/:id:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});


// API de administración: listar comentarios con datos relacionados de receta y usuario
router.get('/api/administracion/comentarios', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const rows = await authModel.obtenerComentariosAdministracion();

    const data = (rows || []).map((row) => ({
      id: row.Com_ID,
      comentario: row.Com_Comentario || '',
      recetaId: row.Rec_ID,
      recetaTitulo: row.Rec_Nombre || '',
      recetaFecha: row.Rec_Fecha_Publicacion,
      usuarioId: row.Usu_ID,
      usuarioNombre: row.Usu_Nombre || '',
      usuarioAlias: row.Usu_Alias || '',
      usuarioTipoId: row.Tipo_Usu_ID,
      usuarioTipoNombre: row.Tipo_Nombre || ''
    }));

    return res.json(data);
  } catch (err) {
    console.error('Error en GET /api/administracion/comentarios:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

router.post('/api/administracion/reportes/:id/acciones', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const reportId = Number(req.params.id);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      return res.status(400).json({ error: 'reporte_invalido' });
    }

    const accionRaw = req.body && typeof req.body.accion === 'string' ? req.body.accion.trim().toLowerCase() : '';
    if (!accionRaw) {
      return res.status(400).json({ error: 'accion_requerida' });
    }

    const accionesPermitidas = new Set(['resolver', 'descartar', 'reabrir', 'eliminar_objeto']);
    if (!accionesPermitidas.has(accionRaw)) {
      return res.status(400).json({ error: 'accion_no_soportada' });
    }

    const { tipoColumn, objetoColumn, fechaColumn } = await resolverColumnasReportes();
    const detail = await authModel.obtenerReporteAdministracionPorId({ reportId, tipoColumn, objetoColumn, fechaColumn });
    if (!detail) {
      return res.status(404).json({ error: 'reporte_no_encontrado' });
    }

    const estadosPorAccion = {
      resolver: 'resuelto',
      descartar: 'descartado',
      reabrir: 'pendiente'
    };

    if (estadosPorAccion[accionRaw]) {
      const actualizado = await authModel.actualizarEstadoReporte(reportId, estadosPorAccion[accionRaw]);
      if (!actualizado) {
        return res.status(500).json({ error: 'no_se_pudo_actualizar' });
      }
      return res.json({ ok: true, estado: estadosPorAccion[accionRaw] });
    }

    if (accionRaw === 'eliminar_objeto') {
      if (detail.tipoReporte === 'comentario' && detail.comentarioId) {
        const eliminado = await authModel.eliminarComentarioAdministracionPorId(detail.comentarioId);
        if (!eliminado) {
          return res.status(500).json({ error: 'no_se_pudo_eliminar_objeto' });
        }
        await authModel.actualizarEstadoReporte(reportId, 'resuelto');
        return res.json({ ok: true, estado: 'resuelto', objetoEliminado: true, tipoObjeto: 'comentario' });
      }
      return res.status(422).json({ error: 'accion_no_disponible_para_tipo' });
    }

    return res.status(400).json({ error: 'accion_no_soportada' });
  } catch (err) {
    console.error('Error en POST /api/administracion/reportes/:id/acciones:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/api/administracion/comentarios/:id', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const commentId = Number(req.params.id);
    if (!Number.isFinite(commentId) || commentId <= 0) {
      return res.status(400).json({ error: 'comentario_invalido' });
    }

    const detail = await authModel.obtenerComentarioAdministracionPorId(commentId);
    if (!detail) {
      return res.status(404).json({ error: 'comentario_no_encontrado' });
    }

    const ensureLeadingSlash = (value) => {
      if (typeof value !== 'string' || !value.trim()) return null;
      const trimmed = value.trim().replace(/^[./]+/, '');
      return `/${trimmed}`;
    };

    return res.json({
      comment: {
        id: detail.commentId,
        texto: detail.commentText || '',
        recetaId: detail.recipeId,
        usuarioId: detail.userId
      },
      user: {
        id: detail.userId,
        nombre: detail.userName || '',
        alias: detail.userAlias || '',
        email: detail.userEmail || '',
        foto: detail.userPhoto || null,
        tipoId: detail.userTypeId,
        tipoNombre: detail.userTypeName || '',
        fechaRegistro: detail.userRegisteredAt,
        activo: Number(detail.userActive) === 1,
        totalRecetas: Number(detail.userTotalRecipes) || 0,
        totalComentarios: Number(detail.userTotalComments) || 0
      },
      recipe: {
        id: detail.recipeId,
        titulo: detail.recipeTitle || '',
        categoriaId: detail.categoryId,
        categoriaNombre: detail.categoryName || '',
        tipoId: detail.recipeTypeId,
        tipoNombre: detail.recipeTypeName || '',
        dificultad: detail.recipeDifficulty != null ? Number(detail.recipeDifficulty) : null,
        tiempoPrep: detail.recipePrepTime,
        porciones: detail.recipePortions != null ? Number(detail.recipePortions) : null,
        fechaPublicacion: detail.recipePublishedAt,
        imagenPrincipal: ensureLeadingSlash(detail.recipePrimaryImage),
        autorId: detail.recipeOwnerId,
        autorNombre: detail.recipeOwnerName || '',
        autorAlias: detail.recipeOwnerAlias || '',
        promedioCalificacion: detail.recipeAvgRating != null ? Number(detail.recipeAvgRating) : null,
        totalCalificaciones: Number(detail.recipeRatingsCount) || 0,
        totalComentarios: Number(detail.recipeTotalComments) || 0
      }
    });
  } catch (err) {
    console.error('Error en GET /api/administracion/comentarios/:id:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

router.delete('/api/administracion/comentarios/:id', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const commentId = Number(req.params.id);
    if (!Number.isFinite(commentId) || commentId <= 0) {
      return res.status(400).json({ error: 'comentario_invalido' });
    }

    const detail = await authModel.obtenerComentarioAdministracionPorId(commentId);
    if (!detail) {
      return res.status(404).json({ error: 'comentario_no_encontrado' });
    }

    const deleted = await authModel.eliminarComentarioAdministracionPorId(commentId);
    if (!deleted) {
      return res.status(500).json({ error: 'no_se_pudo_eliminar' });
    }

    return res.json({
      ok: true,
      mensaje: 'Comentario eliminado correctamente.',
      comentarioId: commentId,
      recetaId: detail.recipeId,
      usuarioId: detail.userId
    });
  } catch (err) {
    console.error('Error en DELETE /api/administracion/comentarios/:id:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});


const sanitizeCategoriaAdministrador = (row = {}) => ({
  id: row.id != null ? Number(row.id) : (row.Cat_ID != null ? Number(row.Cat_ID) : undefined),
  nombre: row.nombre || row.Cat_Nombre || '',
  descripcion: row.descripcion || row.Cat_Descripcion || '',
  imagen: row.imagen || row.Cat_Imagen || null,
  recetasCount: Number(row.recetasCount != null ? row.recetasCount : row.recetas_count || 0),
  premiumCount: Number(row.premiumCount != null ? row.premiumCount : row.premium_count || 0),
  ultimaReceta: row.ultimaReceta || row.ultima_receta || null,
  primeraReceta: row.primeraReceta || row.primera_receta || null,
});

// API de administración: lista de categorías de recetas
router.get('/api/administracion/categorias', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const rows = await authModel.listarCategoriasAdministracion();
    const normalized = Array.isArray(rows) ? rows.map(sanitizeCategoriaAdministrador) : [];
    return res.json(normalized);
  } catch (err) {
    console.error('Error en GET /api/administracion/categorias:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/api/administracion/categorias/:id', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const categoriaId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(categoriaId) || categoriaId <= 0) {
      return res.status(400).json({ error: 'categoria_invalida' });
    }

    const categoria = await authModel.obtenerCategoriaAdministracionPorId(categoriaId);
    if (!categoria) {
      return res.status(404).json({ error: 'categoria_no_encontrada' });
    }

    return res.json(sanitizeCategoriaAdministrador(categoria));
  } catch (err) {
    console.error('Error en GET /api/administracion/categorias/:id:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

const normalizarTextoSimple = (value) => {
  if (typeof value !== 'string') return '';
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
};

// API de administración: crear categoría
router.post('/api/administracion/categorias', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { nombre, descripcion, imagen, imagenDataUrl } = req.body || {};
    const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
    if (!nombreLimpio) {
      return res.status(400).json({ error: 'nombre_requerido' });
    }
    if (nombreLimpio.length > 255) {
      return res.status(400).json({ error: 'nombre_demasiado_largo' });
    }
    if (profanityFilter.containsProfanity(nombreLimpio)) {
      return res.status(400).json({ error: 'nombre_no_permitido' });
    }

    if (await authModel.existeCategoriaConNombre(nombreLimpio)) {
      return res.status(409).json({ error: 'categoria_existente' });
    }

    let descripcionLimpia = null;
    if (typeof descripcion === 'string') {
      const trimmed = descripcion.trim();
      if (trimmed.length > 1000) {
        return res.status(400).json({ error: 'descripcion_demasiado_larga' });
      }
      if (trimmed && profanityFilter.containsProfanity(trimmed)) {
        return res.status(400).json({ error: 'descripcion_no_permitida' });
      }
      descripcionLimpia = trimmed || null;
    }

    const imagenInicial = typeof imagen === 'string' && imagen.trim() ? imagen.trim() : DEFAULT_CATEGORY_IMAGE;
    const categoriaId = await authModel.crearCategoria({ nombre: nombreLimpio, descripcion: descripcionLimpia, imagen: imagenInicial });
    if (!categoriaId) {
      return res.status(500).json({ error: 'no_se_pudo_crear' });
    }

    let rutaImagen = imagenInicial;
    if (typeof imagenDataUrl === 'string' && imagenDataUrl.startsWith('data:image/')) {
      try {
        rutaImagen = await saveCategoryImageFromDataUrl(imagenDataUrl, categoriaId);
        if (rutaImagen) {
          await authModel.actualizarCategoria(categoriaId, { imagen: rutaImagen });
        }
      } catch (imageErr) {
        console.warn('No se pudo guardar la imagen de la categoría:', imageErr && imageErr.message ? imageErr.message : imageErr);
      }
    }

    const creada = await authModel.obtenerCategoriaPorId(categoriaId);
    const responsePayload = sanitizeCategoriaAdministrador({ ...creada, recetasCount: 0, premiumCount: 0 });
    responsePayload.imagen = rutaImagen || responsePayload.imagen;
    return res.status(201).json(responsePayload);
  } catch (err) {
    console.error('Error en POST /api/administracion/categorias:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// API de administración: actualizar categoría
router.put('/api/administracion/categorias/:id', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const categoriaId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(categoriaId) || categoriaId <= 0) {
      return res.status(400).json({ error: 'categoria_invalida' });
    }

    const categoriaActual = await authModel.obtenerCategoriaPorId(categoriaId);
    if (!categoriaActual) {
      return res.status(404).json({ error: 'categoria_no_encontrada' });
    }

    const { nombre, descripcion, imagen, imagenDataUrl, eliminarImagen } = req.body || {};
    const updates = {};

    if (typeof nombre === 'string') {
      const trimmed = nombre.trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'nombre_requerido' });
      }
      if (trimmed.length > 255) {
        return res.status(400).json({ error: 'nombre_demasiado_largo' });
      }
      if (profanityFilter.containsProfanity(trimmed)) {
        return res.status(400).json({ error: 'nombre_no_permitido' });
      }
      const nombreNormalizado = normalizarTextoSimple(trimmed).toLowerCase();
      const actualNormalizado = normalizarTextoSimple(categoriaActual.Cat_Nombre || '').toLowerCase();
      if (nombreNormalizado !== actualNormalizado) {
        if (await authModel.existeCategoriaConNombre(trimmed, categoriaId)) {
          return res.status(409).json({ error: 'categoria_existente' });
        }
      }
      updates.nombre = trimmed;
    }

    if (typeof descripcion !== 'undefined') {
      if (descripcion === null || descripcion === '') {
        updates.descripcion = null;
      } else if (typeof descripcion === 'string') {
        const trimmed = descripcion.trim();
        if (trimmed.length > 1000) {
          return res.status(400).json({ error: 'descripcion_demasiado_larga' });
        }
        if (trimmed && profanityFilter.containsProfanity(trimmed)) {
          return res.status(400).json({ error: 'descripcion_no_permitida' });
        }
        updates.descripcion = trimmed;
      } else {
        return res.status(400).json({ error: 'descripcion_invalida' });
      }
    }

    if (typeof imagen === 'string') {
      updates.imagen = imagen.trim() || DEFAULT_CATEGORY_IMAGE;
    }

    if (typeof eliminarImagen !== 'undefined') {
      const flag = eliminarImagen === true || eliminarImagen === 'true' || Number(eliminarImagen) === 1;
      if (flag) {
        await deleteCategoryImage(categoriaId);
        updates.imagen = DEFAULT_CATEGORY_IMAGE;
      }
    }

    if (typeof imagenDataUrl === 'string' && imagenDataUrl.startsWith('data:image/')) {
      try {
        const rutaGenerada = await saveCategoryImageFromDataUrl(imagenDataUrl, categoriaId);
        if (rutaGenerada) {
          updates.imagen = rutaGenerada;
        } else if (!updates.imagen) {
          updates.imagen = DEFAULT_CATEGORY_IMAGE;
        }
      } catch (imageErr) {
        return res.status(422).json({ error: imageErr && imageErr.message ? imageErr.message : 'error_imagen' });
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'sin_cambios' });
    }

    await authModel.actualizarCategoria(categoriaId, updates);
    const actualizada = await authModel.obtenerCategoriaPorId(categoriaId);
    return res.json(sanitizeCategoriaAdministrador(actualizada));
  } catch (err) {
    console.error('Error en PUT /api/administracion/categorias/:id:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// API de administración: eliminar categoría
router.delete('/api/administracion/categorias/:id', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const categoriaId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(categoriaId) || categoriaId <= 0) {
      return res.status(400).json({ error: 'categoria_invalida' });
    }

    const categoriaActual = await authModel.obtenerCategoriaPorId(categoriaId);
    if (!categoriaActual) {
      return res.status(404).json({ error: 'categoria_no_encontrada' });
    }

    const recetasVinculadas = await authModel.contarRecetasEnCategoria(categoriaId);
    if (recetasVinculadas > 0) {
      return res.status(409).json({ error: 'categoria_con_recetas', total: recetasVinculadas });
    }

    await deleteCategoryImage(categoriaId).catch(() => null);
    await authModel.eliminarCategoria(categoriaId);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error en DELETE /api/administracion/categorias/:id:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// API de administración: lista de tipos de recetas
router.get('/api/administracion/recetas/tipos', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const rows = await authModel.obtenerTiposReceta();
    return res.json(rows || []);
  } catch (err) {
    console.error('Error en GET /api/administracion/recetas/tipos:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// API de administración: detalle de receta
router.get('/api/administracion/recetas/:id', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const recipeId = parseInt(req.params.id, 10);
    if (!Number.isInteger(recipeId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const recipe = await authModel.obtenerDetalleRecetaPorId(recipeId);

    if (!recipe) {
      return res.status(404).json({ error: 'Receta no encontrada' });
    }

    const images = await obtenerImagenesReceta(recipeId);

    const utensilRows = await authModel.obtenerUtensiliosPorReceta(recipeId);
    const ingredientRows = await authModel.obtenerIngredientesPorReceta(recipeId);

    const utensils = Array.isArray(utensilRows)
      ? utensilRows
          .map((row) => ({
            id: Number(row.id),
            name: typeof row.name === 'string' ? row.name.trim() : '',
          }))
          .filter((item) => item.name.length > 0)
      : [];
    const utensilNames = utensils.map((item) => item.name);

    const ingredients = Array.isArray(ingredientRows)
      ? ingredientRows
          .map((row) => ({
            id: Number(row.id),
            name: typeof row.name === 'string' ? row.name.trim() : '',
            quantity: row && typeof row.quantity !== 'undefined' && row.quantity !== null ? String(row.quantity).trim() : '',
            unit: row && typeof row.unit !== 'undefined' && row.unit !== null ? String(row.unit).trim() : '',
          }))
          .filter((item) => item.name.length > 0)
      : [];

    const detail = {
      id: recipe.Rec_ID,
      titulo: recipe.Rec_Nombre || '',
      descripcion: recipe.Rec_Descripcion || '',
      instrucciones: recipe.Rec_Instrucciones || '',
      categoriaId: recipe.Cat_ID,
      categoriaNombre: recipe.Cat_Nombre || '',
      autorId: recipe.Usu_ID,
      autorNombre: recipe.Usu_Nombre || '',
      fechaPublicacion: recipe.Rec_Fecha_Publicacion,
      dificultad: recipe.Rec_Dificultad,
      tiempoPrep: recipe.Rec_Tiempo_Prep,
      porciones: recipe.Rec_Porcion === null || typeof recipe.Rec_Porcion === 'undefined' ? null : Number(recipe.Rec_Porcion),
      tipoRecetaId: recipe.Tipo_Rec_ID === null || typeof recipe.Tipo_Rec_ID === 'undefined' ? null : Number(recipe.Tipo_Rec_ID),
      tipoRecetaNombre: recipe.Tipo_Nombre || '',
      images,
      utensils,
      utensilNames,
      ingredients,
      ingredientNames: ingredients.map((item) => item.name)
    };

    return res.json(detail);
  } catch (err) {
    console.error('Error en GET /api/administracion/recetas/:id:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// API de administración: actualizar receta
router.put('/api/administracion/recetas/:id', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const recipeId = parseInt(req.params.id, 10);
    if (!Number.isInteger(recipeId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const currentRecipe = await authModel.obtenerRecetaPorId(recipeId);
    if (!currentRecipe) {
      return res.status(404).json({ error: 'Receta no encontrada' });
    }

    const {
      titulo,
      descripcion,
      instrucciones,
      categoriaId,
      dificultad,
      tiempoPrep,
      porciones,
      tipoRecetaId,
      utensils: utensilsRaw,
      utensilios: utensiliosRaw,
      ingredients: ingredientsRaw,
      ingredientes: ingredientesRaw
    } = req.body || {};

    const updates = [];
    const values = [];

    if (typeof titulo === 'string') {
      const trimmed = titulo.trim();
      if (!trimmed) return res.status(400).json({ error: 'El título es obligatorio' });
      if (profanityFilter.containsProfanity(trimmed)) {
        return res.status(400).json({ error: 'El título contiene palabras no permitidas' });
      }
      updates.push('Rec_Nombre = ?');
      values.push(trimmed);
    }

    if (typeof descripcion === 'string') {
      if (profanityFilter.containsProfanity(descripcion)) {
        return res.status(400).json({ error: 'La descripción contiene palabras no permitidas' });
      }
      updates.push('Rec_Descripcion = ?');
      values.push(descripcion);
    }

    if (typeof instrucciones === 'string') {
      if (profanityFilter.containsProfanity(instrucciones)) {
        return res.status(400).json({ error: 'Las instrucciones contienen palabras no permitidas' });
      }
      updates.push('Rec_Instrucciones = ?');
      values.push(instrucciones);
    }

    if (typeof categoriaId !== 'undefined') {
      const parsedCat = parseInt(categoriaId, 10);
      if (!Number.isInteger(parsedCat)) {
        return res.status(400).json({ error: 'Categoría inválida' });
      }
      const catRow = await authModel.obtenerCategoriaPorId(parsedCat);
      if (!catRow) {
        return res.status(400).json({ error: 'La categoría seleccionada no existe' });
      }
      updates.push('Cat_ID = ?');
      values.push(parsedCat);
    }

    if (typeof dificultad !== 'undefined') {
      const parsed = parseInt(dificultad, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
        return res.status(400).json({ error: 'La dificultad debe estar entre 1 y 10' });
      }
      updates.push('Rec_Dificultad = ?');
      values.push(parsed);
    }

    if (typeof tiempoPrep === 'string') {
      const trimmed = tiempoPrep.trim();
      if (!trimmed) return res.status(400).json({ error: 'El tiempo de preparación es obligatorio' });
      const match = /^([0-1]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(trimmed);
      if (!match) {
        return res.status(400).json({ error: 'Formato de tiempo inválido (usa HH:MM o HH:MM:SS)' });
      }
      const hh = match[1].padStart(2, '0');
      const mm = match[2].padStart(2, '0');
      const ss = (match[3] ? match[3] : '00').padStart(2, '0');
      updates.push('Rec_Tiempo_Prep = ?');
      values.push(`${hh}:${mm}:${ss}`);
    }

    if (typeof porciones !== 'undefined') {
      const parsedPorciones = parseInt(porciones, 10);
      if (!Number.isInteger(parsedPorciones) || parsedPorciones <= 0) {
        return res.status(400).json({ error: 'Las porciones deben ser un número entero mayor a 0' });
      }
      updates.push('Rec_Porcion = ?');
      values.push(parsedPorciones);
    }

    if (typeof tipoRecetaId !== 'undefined') {
      const parsedTipo = parseInt(tipoRecetaId, 10);
      if (!Number.isInteger(parsedTipo)) {
        return res.status(400).json({ error: 'Tipo de receta inválido' });
      }
      const tipoRow = await authModel.obtenerTipoRecetaPorId(parsedTipo);
      if (!tipoRow) {
        return res.status(400).json({ error: 'El tipo de receta seleccionado no existe' });
      }
      updates.push('Tipo_Rec_ID = ?');
      values.push(parsedTipo);
    }

    const resolvedUtensilsPayload = typeof utensilsRaw !== 'undefined' ? utensilsRaw : utensiliosRaw;
    let normalizedUtensils = [];
    let shouldUpdateUtensils = false;

    if (typeof resolvedUtensilsPayload !== 'undefined') {
      if (!Array.isArray(resolvedUtensilsPayload)) {
        return res.status(400).json({ error: 'utensilios_payload_invalido' });
      }
      shouldUpdateUtensils = true;
      const MAX_UTENSILS = 20;
      const cleanedNames = resolvedUtensilsPayload
        .map((item) => (typeof item === 'string' ? item.trim().replace(/\s+/g, ' ').slice(0, 100) : ''))
        .filter((item) => item.length > 0);

      const seen = new Set();
      const formattedList = [];
      for (const name of cleanedNames) {
        const formatted = name
          .split(/\s+/)
          .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ''))
          .join(' ')
          .trim();
        if (!formatted) continue;
        const key = formatted
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        formattedList.push(formatted);
        if (formattedList.length >= MAX_UTENSILS) break;
      }

      if (formattedList.some((value) => profanityFilter.containsProfanity(value))) {
        return res.status(400).json({ error: 'utensilios_contienen_profanidad' });
      }

      normalizedUtensils = formattedList;
    }

    const resolvedIngredientsPayload = typeof ingredientsRaw !== 'undefined' ? ingredientsRaw : ingredientesRaw;
    let normalizedIngredients = [];
    let shouldUpdateIngredients = false;

    if (typeof resolvedIngredientsPayload !== 'undefined') {
      if (!Array.isArray(resolvedIngredientsPayload)) {
        return res.status(400).json({ error: 'ingredientes_payload_invalido' });
      }
      shouldUpdateIngredients = true;
      const MAX_INGREDIENTS = 60;
      const mapped = resolvedIngredientsPayload
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const rawName = typeof item.name === 'string' ? item.name.trim() : '';
          const rawQuantity = typeof item.quantity === 'string'
            ? item.quantity.trim()
            : (typeof item.quantity === 'number' ? String(item.quantity) : '');
          const rawUnit = typeof item.unit === 'string'
            ? item.unit.trim()
            : (typeof item.unit === 'number' ? String(item.unit) : '');
          const rawType = typeof item.typeId !== 'undefined'
            ? Number(item.typeId)
            : (typeof item.tipoId !== 'undefined' ? Number(item.tipoId) : Number.NaN);
          const nameValue = rawName.slice(0, 100);
          const quantityValue = rawQuantity.slice(0, 100);
          const unitValue = rawUnit.slice(0, 50);
          const typeId = Number.isFinite(rawType) && rawType > 0 ? rawType : null;
          if (!nameValue) return null;
          return {
            name: nameValue,
            quantity: quantityValue,
            unit: unitValue,
            typeId,
          };
        })
        .filter(Boolean);

      if (!mapped.length) {
        return res.status(400).json({ error: 'ingredientes_invalidos' });
      }

      const seen = new Map();
      mapped.forEach((ingredient) => {
        const key = ingredient.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
          .toLowerCase();
        if (!key) return;
        seen.set(key, ingredient);
      });

      normalizedIngredients = Array.from(seen.values()).slice(0, MAX_INGREDIENTS);

      if (!normalizedIngredients.length) {
        return res.status(400).json({ error: 'ingredientes_invalidos' });
      }

      const ingredientsContainProfanity = normalizedIngredients.some((ingredient) => {
        if (profanityFilter.containsProfanity(ingredient.name)) return true;
        if (ingredient.quantity && profanityFilter.containsProfanity(ingredient.quantity)) return true;
        if (ingredient.unit && profanityFilter.containsProfanity(ingredient.unit)) return true;
        return false;
      });
      if (ingredientsContainProfanity) {
        return res.status(400).json({ error: 'ingredientes_contienen_profanidad' });
      }
    }

    if (updates.length === 0 && !shouldUpdateUtensils && !shouldUpdateIngredients) {
      return res.status(400).json({ error: 'No se recibieron cambios' });
    }

    const requiresTransaction = shouldUpdateUtensils || shouldUpdateIngredients;
    let connection = null;
    try {
      if (requiresTransaction) {
        connection = await authModel.obtenerConexion();
        await connection.beginTransaction();
      }

      if (updates.length) {
        if (connection) {
          await authModel.actualizarRecetaPorId(recipeId, updates, values, connection);
        } else {
          await authModel.actualizarRecetaPorId(recipeId, updates, values);
        }
      }

      if (connection && shouldUpdateIngredients) {
        await authModel.eliminarIngredientesReceta(connection, recipeId);

        for (const ingredient of normalizedIngredients) {
          let ingredientId = await authModel.buscarIngredienteIdPorNombre(connection, ingredient.name);
          if (!ingredientId) {
            const nextId = await authModel.obtenerSiguienteIngredienteId(connection);
            await authModel.insertarIngrediente(connection, nextId, ingredient.name, ingredient.typeId);
            ingredientId = nextId;
          }
          await authModel.insertarActualizarRecetaIngrediente(connection, recipeId, ingredientId, ingredient.quantity, ingredient.unit);
        }
      }

      if (connection && shouldUpdateUtensils) {
        await authModel.eliminarUtensiliosReceta(connection, recipeId);

        if (normalizedUtensils.length) {
          const asegurarUtensilioId = async (utensilName) => {
            const normalized = utensilName ? utensilName.trim() : '';
            if (!normalized) {
              return null;
            }

            const existing = await authModel.buscarUtensilioPorNombre(connection, normalized);
            if (existing && existing.Ute_ID) {
              return Number(existing.Ute_ID);
            }

            const baseMax = await authModel.obtenerMaximoUtensilioId(connection);
            const nextId = Number.isFinite(baseMax) ? baseMax + 1 : 1;

            try {
              await authModel.insertarUtensilio(connection, nextId, normalized);
              return nextId;
            } catch (err) {
              const retryExisting = await authModel.buscarUtensilioPorNombre(connection, normalized);
              if (retryExisting && retryExisting.Ute_ID) {
                return Number(retryExisting.Ute_ID);
              }
              throw err;
            }
          };

          for (const utensilName of normalizedUtensils) {
            const utensilId = await asegurarUtensilioId(utensilName);
            if (!utensilId) continue;
            await authModel.insertarActualizarRecetaUtensilio(connection, recipeId, utensilId);
          }
        }
      }

      if (connection) {
        await connection.commit();
      }
    } catch (err) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackErr) {
          console.error('Error al hacer rollback en PUT /api/administracion/recetas/:id (ingredientes/utensilios):', rollbackErr);
        }
      }
      throw err;
    } finally {
      if (connection) connection.release();
    }

    const updatedRecipe = await authModel.obtenerDetalleRecetaPorId(recipeId);

    const images = await obtenerImagenesReceta(recipeId);

    const updatedUtensilRows = await authModel.obtenerUtensiliosPorReceta(recipeId);
    const updatedIngredientRows = await authModel.obtenerIngredientesPorReceta(recipeId);

    const utensils = Array.isArray(updatedUtensilRows)
      ? updatedUtensilRows
          .map((row) => ({
            id: Number(row.id),
            name: typeof row.name === 'string' ? row.name.trim() : '',
          }))
          .filter((item) => item.name.length > 0)
      : [];
    const utensilNames = utensils.map((item) => item.name);

    const ingredients = Array.isArray(updatedIngredientRows)
      ? updatedIngredientRows
          .map((row) => ({
            id: Number(row.id),
            name: typeof row.name === 'string' ? row.name.trim() : '',
            quantity: row && typeof row.quantity !== 'undefined' && row.quantity !== null ? String(row.quantity).trim() : '',
            unit: row && typeof row.unit !== 'undefined' && row.unit !== null ? String(row.unit).trim() : '',
          }))
          .filter((item) => item.name.length > 0)
      : [];
    const ingredientNames = ingredients.map((item) => item.name);

    return res.json({
      ok: true,
      recipe: updatedRecipe ? {
        id: updatedRecipe.Rec_ID,
        titulo: updatedRecipe.Rec_Nombre,
        descripcion: updatedRecipe.Rec_Descripcion,
        instrucciones: updatedRecipe.Rec_Instrucciones,
        categoriaId: updatedRecipe.Cat_ID,
        categoriaNombre: updatedRecipe.Cat_Nombre,
        autorId: updatedRecipe.Usu_ID,
        autorNombre: updatedRecipe.Usu_Nombre,
        fechaPublicacion: updatedRecipe.Rec_Fecha_Publicacion,
        dificultad: updatedRecipe.Rec_Dificultad,
        tiempoPrep: updatedRecipe.Rec_Tiempo_Prep,
        porciones: updatedRecipe.Rec_Porcion === null || typeof updatedRecipe.Rec_Porcion === 'undefined' ? null : Number(updatedRecipe.Rec_Porcion),
        tipoRecetaId: updatedRecipe.Tipo_Rec_ID === null || typeof updatedRecipe.Tipo_Rec_ID === 'undefined' ? null : Number(updatedRecipe.Tipo_Rec_ID),
        tipoRecetaNombre: updatedRecipe.Tipo_Nombre || '',
        images,
        utensils,
        utensilNames,
        ingredients,
        ingredientNames
      } : null
    });
  } catch (err) {
    console.error('Error en PUT /api/administracion/recetas/:id:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// API de administración: subir imágenes adicionales de receta (máximo 5 por receta)
router.post('/api/administracion/recetas/:id/imagenes', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const recipeId = parseInt(req.params.id, 10);
    if (!Number.isInteger(recipeId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const currentRecipe = await authModel.obtenerRecetaPorId(recipeId);
    if (!currentRecipe) {
      return res.status(404).json({ error: 'Receta no encontrada' });
    }

    const imageRows = await authModel.obtenerImagenesRecetaOrdenadas(recipeId);

    const currentImages = Array.isArray(imageRows) ? imageRows : [];
    if (currentImages.length >= MAX_RECIPE_IMAGES) {
      return res.status(400).json({ error: `Solo se permiten ${MAX_RECIPE_IMAGES} imágenes por receta` });
    }

    const payloadImages = req.body && Array.isArray(req.body.images) ? req.body.images : [];
    if (!payloadImages.length) {
      return res.status(400).json({ error: 'Selecciona al menos una imagen válida.' });
    }

    const dataUrls = payloadImages
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const raw = typeof item.dataUrl === 'string' ? item.dataUrl.trim() : '';
        return raw;
      })
      .filter((value) => value && value.startsWith('data:image/'));

    if (!dataUrls.length) {
      return res.status(400).json({ error: 'Formato de imagen no válido.' });
    }

    if (currentImages.length + dataUrls.length > MAX_RECIPE_IMAGES) {
      return res.status(400).json({ error: `Solo se permiten ${MAX_RECIPE_IMAGES} imágenes por receta` });
    }

    const usedIndexes = new Set();
    currentImages.forEach((row) => {
      const idx = analizarIndiceImagenReceta(row.Img_Rutas);
      if (Number.isInteger(idx) && idx >= 0 && idx < MAX_RECIPE_IMAGES) {
        usedIndexes.add(idx);
      }
    });

    const availableIndexes = [];
    for (let idx = 0; idx < MAX_RECIPE_IMAGES; idx += 1) {
      if (!usedIndexes.has(idx)) {
        availableIndexes.push(idx);
      }
    }

    if (dataUrls.length > availableIndexes.length) {
      return res.status(400).json({ error: `Solo se permiten ${MAX_RECIPE_IMAGES} imágenes por receta` });
    }

    const savedImages = [];

    try {
      for (let i = 0; i < dataUrls.length; i += 1) {
        const targetIndex = availableIndexes[i];
        const relativePath = await saveRecipeImageFromDataUrl(dataUrls[i], recipeId, targetIndex);
        if (!relativePath) {
          throw new Error('invalid_image_format');
        }
        const absolutePath = path.join(__dirname, '..', ...relativePath.split('/'));
        savedImages.push({ relativePath, absolutePath });
      }
    } catch (fileErr) {
      await Promise.allSettled(savedImages.map((img) => fs.promises.unlink(img.absolutePath).catch(() => {})));
      let message = 'Error al procesar las imágenes seleccionadas.';
      if (fileErr && fileErr.message === 'image_too_large') {
        message = 'Cada imagen debe pesar menos de 5 MB.';
      } else if (fileErr && fileErr.message === 'too_many_images') {
        message = `Solo se permiten ${MAX_RECIPE_IMAGES} imágenes por receta.`;
      } else if (fileErr && fileErr.message === 'image_path_too_long') {
        message = 'La ruta generada para la imagen es demasiado larga.';
      } else if (fileErr && fileErr.message === 'invalid_recipe_id') {
        message = 'No se pudo identificar la receta para guardar las imágenes.';
      } else if (fileErr && fileErr.message === 'invalid_image_format') {
        message = 'Formato de imagen no válido.';
      }
      return res.status(400).json({ error: message });
    }

    let connection = null;
    try {
      connection = await authModel.obtenerConexion();
      await connection.beginTransaction();

      let nextId = await authModel.obtenerSiguienteRecetaImagenIdConConexion(connection);

      for (const saved of savedImages) {
        await authModel.insertarRecetaImagenConConexion(connection, nextId, recipeId, saved.relativePath);
        nextId += 1;
      }

      await connection.commit();
    } catch (dbErr) {
      if (connection) {
        try { await connection.rollback(); } catch (rollbackErr) {
          console.error('Error revirtiendo transacción al guardar imágenes:', rollbackErr);
        }
      }
      await Promise.allSettled(savedImages.map((img) => fs.promises.unlink(img.absolutePath).catch(() => {})));
      console.error('Error en POST /api/administracion/recetas/:id/imagenes (insert base64):', dbErr && dbErr.message ? dbErr.message : dbErr);
      return res.status(500).json({ error: 'No se pudieron guardar las imágenes' });
    } finally {
      if (connection) connection.release();
    }

    const images = await obtenerImagenesReceta(recipeId);
    return res.json({ ok: true, images });
  } catch (err) {
    console.error('Error en POST /api/administracion/recetas/:id/imagenes (base64):', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno al subir imágenes' });
  }
});

// API de administración: eliminar una imagen específica de la receta
router.delete('/api/administracion/recetas/:id/imagenes/:imagenId', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const recipeId = parseInt(req.params.id, 10);
    const imageId = parseInt(req.params.imagenId, 10);
    if (!Number.isInteger(recipeId) || !Number.isInteger(imageId)) {
      return res.status(400).json({ error: 'Identificadores inválidos' });
    }

    const imageRow = await authModel.obtenerRecetaImagenPorId(imageId, recipeId);
    if (!imageRow) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    const imagePath = imageRow.Img_Rutas;

    await authModel.eliminarRecetaImagenPorId(imageId, recipeId);

    if (imagePath && imagePath !== 'Imagenes/Recetas/0.png') {
      const absolutePath = path.join(__dirname, '..', imagePath);
      fs.promises.unlink(absolutePath).catch(() => {});
    }

    const images = await obtenerImagenesReceta(recipeId);
    return res.json({ ok: true, images });
  } catch (err) {
    console.error('Error en DELETE /api/administracion/recetas/:id/imagenes/:imagenId:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno al eliminar imagen' });
  }
});

// API de administración: restablecer imágenes de receta al marcador de posición predeterminado
router.post('/api/administracion/recetas/:id/restablecer-imagen', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const recipeId = parseInt(req.params.id, 10);
    if (!Number.isInteger(recipeId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const recipe = await authModel.obtenerRecetaPorId(recipeId);
    if (!recipe) {
      return res.status(404).json({ error: 'Receta no encontrada' });
    }

    const defaultPath = 'Imagenes/Recetas/0.png';
    const existing = await authModel.obtenerRecetaImagenPrincipal(recipeId);
    if (existing && typeof existing.Img_ID !== 'undefined') {
      const firstId = existing.Img_ID;
      await authModel.actualizarRecetaImagenRuta(firstId, defaultPath);
      await authModel.eliminarRecetaImagenesExcluyendo(recipeId, firstId);
    } else {
      const nextId = await authModel.obtenerSiguienteRecetaImagenId();
      await authModel.insertarRecetaImagen(nextId, recipeId, defaultPath);
    }

    const images = await obtenerImagenesReceta(recipeId);
    return res.json({ ok: true, images });
  } catch (err) {
    console.error('Error en POST /api/administracion/recetas/:id/restablecer-imagen:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno al restablecer imagen' });
  }
});

// API de administración: eliminar receta y datos relacionados
router.delete('/api/administracion/recetas/:id', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  let connection = null;
  let transactionStarted = false;
  let pendingImageRows = [];

  try {
    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const recipeId = parseInt(req.params.id, 10);
    if (!Number.isInteger(recipeId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    connection = await authModel.obtenerConexion();
    await connection.beginTransaction();
    transactionStarted = true;

      const [imageRows] = await connection.query('SELECT Img_Rutas FROM receta_imagenes WHERE Rec_ID = ?', [recipeId]);
      pendingImageRows = Array.isArray(imageRows) ? imageRows : [];

    const recipeRow = await authModel.obtenerRecetaParaEliminacion(connection, recipeId);
    if (!recipeRow) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ error: 'Receta no encontrada' });
    }

    await authModel.eliminarRelacionesReceta(connection, recipeId);
    await authModel.eliminarRecetaPorId(connection, recipeId);

    await connection.commit();
    transactionStarted = false;

    await removeRecipeImageFiles(pendingImageRows);
    return res.json({ ok: true });
  } catch (err) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error('Error al hacer rollback en DELETE /api/administracion/recetas/:id:', rollbackErr);
      }
    }
    console.error('Error en DELETE /api/administracion/recetas/:id:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno al eliminar receta' });
  } finally {
    if (connection) connection.release();
  }
});

// API de administración: restablecer foto de usuario a imagen predeterminada
router.post('/api/administracion/usuarios/:id/restablecer-foto', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const admin = await esSesionAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const userId = parseInt(req.params.id, 10);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const userRow = await authModel.obtenerTipoEIdUsuario(userId);
    if (!userRow) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (Number(userRow.Tipo_Usu_ID) === 1) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const targetFilename = `${userId}.png`;
    const targetRelativePath = path.posix.join('Imagenes', 'Usuarios', targetFilename);
    const defaultAbsolutePath = path.join(USER_IMAGES_DIR, DEFAULT_USER_IMAGE_FILENAME);
    const targetAbsolutePath = path.join(USER_IMAGES_DIR, targetFilename);

    try {
      await ensureUserImagesDir();
      await fs.promises.copyFile(defaultAbsolutePath, targetAbsolutePath);
    } catch (fileErr) {
      console.error('No se pudo copiar la imagen predeterminada para el usuario', fileErr && fileErr.message ? fileErr.message : fileErr);
      return res.status(500).json({ error: 'No se pudo restablecer la foto del usuario.' });
    }

    await authModel.actualizarUsuarioFoto(userId, targetRelativePath);

    return res.json({ ok: true, foto: normalizarRutaFoto(targetRelativePath) });
  } catch (err) {
    console.error('Error en POST /api/administracion/usuarios/:id/restablecer-foto:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Error interno al restablecer foto' });
  }
});

// Obtener información del usuario autenticado
router.get('/api/usuario', async (req, res) => {
  try {
    console.debug('/api/usuario called - session present?', !!(req.session && req.session.user));
    console.debug('/api/usuario - request headers.cookie:', req.headers && req.headers.cookie);
    try { console.debug('/api/usuario - req.session:', JSON.stringify(req.session)); } catch (e) { console.debug('/api/usuario - req.session (unserializable)'); }

    const userId = obtenerIdUsuarioDeReq(req);
    if (!userId) {
      console.debug('/api/usuario - no userId available');
      return res.status(401).json({ error: 'No autenticado' });
    }

    // consultar BD por id (seleccionar todos los campos disponibles)
    const user = await authModel.obtenerUsuarioCompletoPorId(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const tipoValueRaw = typeof user.Tipo_Usu_ID !== 'undefined' ? Number(user.Tipo_Usu_ID) : null;
    const tipoValue = Number.isFinite(tipoValueRaw) ? tipoValueRaw : null;

    // normalizar foto
    const foto = normalizarRutaFoto(user.Usu_Foto);

    // si no había sesión, sincronizarla
    if (req.session) {
      req.session.user = req.session.user || {};
      if (!req.session.user.id) req.session.user.id = user.Usu_ID;
      if (!req.session.user.Usu_Nombre) req.session.user.Usu_Nombre = user.Usu_Nombre;
      if (!req.session.user.Usu_Email) req.session.user.Usu_Email = user.Usu_Email;
      if (tipoValue !== null) {
        req.session.user.Tipo_Usu_ID = tipoValue;
      }
      try { req.session.save(() => { }); } catch (e) { /* ignore */ }
    }

    // Construir respuesta con campos opcionales si existen en la fila
    const resp = {
      id: user.Usu_ID,
      nombre: user.Usu_Nombre || '',
      email: user.Usu_Email || '',
      // Prefer the newer `Usu_Biografia`, then legacy `Usu_Bio`, then any `bio` field
      bio: (user.Usu_Biografia || user.Usu_Bio || user.bio || '').toString().slice(0, 255),
      foto
    };

    // Exponer tipo de usuario (Tipo_Usu_ID) para la lógica del frontend que muestra/oculta elementos de la interfaz de usuario.
    // Normalizar a `Tipo_Usu_ID` para que el código del lado del cliente pueda leerlo de manera consistente.
    if (tipoValue !== null) {
      resp.Tipo_Usu_ID = tipoValue;
    } else if (typeof user.Tipo_Usu_ID !== 'undefined' && user.Tipo_Usu_ID !== null) {
      const legacyTipo = Number(user.Tipo_Usu_ID);
      if (Number.isFinite(legacyTipo)) {
        resp.Tipo_Usu_ID = legacyTipo;
      }
    }

    // Calcular la calificación promedio para este usuario a partir de calificaciones + recetas
    try {
      const ratingSummary = await authModel.obtenerResumenCalificacionesUsuario(user.Usu_ID);
      const avgRaw = ratingSummary && typeof ratingSummary.avgRating !== 'undefined' ? Number(ratingSummary.avgRating) : 0;
      resp.avg_rating = Number((avgRaw || 0).toFixed(1));
      resp.ratings_count = ratingSummary && typeof ratingSummary.cnt !== 'undefined' ? Number(ratingSummary.cnt) : 0;

      console.debug('avg_rating:', resp.avg_rating, 'ratings_count:', resp.ratings_count);

    } catch (e) {
      console.debug('/api/usuario - could not compute avg rating (table missing or query failed)', e);
      resp.avg_rating = 0;
      resp.ratings_count = 0;
    }

    // Mapeos comunes (si la columna existe en la tabla, estará en `user`)
    if (user.Usu_Alias) resp.username = user.Usu_Alias;
    if (user.Usu_Telefono) resp.phone = user.Usu_Telefono;
    if (user.Usu_Preferences) resp.preferences = user.Usu_Preferences;
    if (user.Usu_Website) resp.website = user.Usu_Website;

    // Alergias (si existen)
    if (user.Ale_ID ) resp.allergies = (user.Ale_ID || '').toString();

    return res.json(resp);
  } catch (err) {
    console.error('Error en /api/usuario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener perfil público por alias (modo consulta). No requiere sesión.
router.get('/api/usuario/alias/:alias', async (req, res) => {
  try {
    const alias = (req.params.alias || '').trim();
    if (!alias) return res.status(400).json({ error: 'Alias requerido' });

    const user = await authModel.obtenerUsuarioPorAlias(alias);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Normalizar foto (reusar helper)
    const foto = normalizarRutaFoto(user.Usu_Foto);

    // Construir respuesta pública: evitar exponer email/telefono
    const resp = {
      id: user.Usu_ID,
      nombre: user.Usu_Nombre || '',
      username: user.Usu_Alias || '',
      bio: (user.Usu_Biografia || user.Usu_Bio || user.bio || '').toString().slice(0, 255),
      foto,
      website: user.Usu_Website || '',

    };
    if (user.Ale_ID ) resp.allergies = (user.Ale_ID || '').toString();

    return res.json(resp);
  } catch (err) {
    console.error('Error en /api/usuario/alias/:alias', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// Endpoint para obtener todos los logros y el estado de desbloqueo del usuario (si está autenticado)
router.get('/api/logros', async (req, res) => {
  try {
    // detectar userId (sesión o cookie fallback)
    let userId = null;
    if (req.session && req.session.user && req.session.user.id) userId = req.session.user.id;
    else if (req.headers && req.headers.cookie) {
      const cookies = Object.fromEntries(req.headers.cookie.split(';').map(s => { const [k, ...v] = s.split('='); return [k.trim(), v.join('=').trim()]; }));
      if (cookies.userInfo) {
        try { const u = JSON.parse(decodeURIComponent(cookies.userInfo)); if (u && u.id) userId = u.id; } catch (e) { /* ignore */ }
      }
    }

    // Obtener todos los logros
    const all = await authModel.obtenerTodosLosLogros();
    console.debug('/api/logros - fetched logros count=', (all && all.length) || 0, 'ids=', (all || []).slice(0, 20).map(r => r.Logro_Id));

    // Build set/map of unlocked logro ids and their fecha_obtenido (if available)
    let unlockedSet = new Set();
    const unlockedDates = new Map();
    if (userId) {
      const done = await authModel.obtenerLogrosUsuario(userId);
      for (const r of done) {
        const idStr = String(r.logro_Id);
        unlockedSet.add(idStr);
        // store raw DB value (may be datetime string)
        unlockedDates.set(idStr, r.Usu_Logro_Fecha_obtenido || null);
      }
      // log unlocked entries with their dates for easier debugging
      try {
        console.debug('/api/logros - usuario_logros:', (Array.from(unlockedDates.entries()).slice(0, 50)).map(([id, fecha]) => ({ logro_Id: id, fecha_obtenido: fecha })));
      } catch (e) { console.debug('/api/logros - could not stringify usuario_logros', e); }
    }

    const achievements = (all || []).map(r => ({
      id: r.Logro_Id,
      nombre: r.Logro_Nombre,
      descripcion: r.Logro_Descripcion,
      nivel: r.Logro_Nivel,
      Logro_puntos: r.Logro_puntos,
      unlocked: unlockedSet.has(String(r.Logro_Id)),
      // include fecha_obtenido for unlocked items (may be null)
      fecha_obtenido: unlockedDates.get(String(r.Logro_Id)) || null
    }));

    console.debug('/api/logros - computed achievements length=', achievements.length, 'unlockedCount=', unlockedSet.size);

    const total = achievements.length;
    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const percent = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

    return res.json({ total, unlockedCount, percent, achievements });
  } catch (err) {
    console.error('Error en /api/logros:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

router.post('/api/logros/:id/desbloquear', async (req, res) => {
  try {
    const userId = obtenerIdUsuarioDeReq(req);
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const rawId = req.params.id;
    const achievementId = Number(rawId);
    if (!Number.isInteger(achievementId) || achievementId <= 0) {
      return res.status(400).json({ error: 'Identificador de logro inválido' });
    }

    const alreadyUnlocked = await authModel.existeLogroUsuario(userId, achievementId);
    if (alreadyUnlocked) {
      const achRow = await authModel.obtenerLogroPorId(achievementId);
      const payload = achRow ? {
        id: achievementId,
        nombre: achRow.Logro_Nombre,
        puntos: achRow.Logro_puntos
      } : { id: achievementId };
      return res.status(200).json({ status: 'already_unlocked', achievement: payload });
    }

    await authModel.insertarLogroUsuario(userId, achievementId);

    const achRow = await authModel.obtenerLogroPorId(achievementId);
    const achievement = achRow ? {
      id: achievementId,
      nombre: achRow.Logro_Nombre,
      puntos: achRow.Logro_puntos
    } : { id: achievementId };

    return res.json({ status: 'unlocked', achievement });
  } catch (err) {
    console.error('Error en /api/logros/:id/desbloquear', err);
    return res.status(500).json({ error: 'No se pudo desbloquear el logro' });
  }
});

// Endpoint para actualizar el perfil del usuario
const procesarActualizacionPerfil = async (req, res) => {
  try {
    // determinar userId como en /api/usuario
    let userId = null;
    if (req.session && req.session.user && req.session.user.id) userId = req.session.user.id;
    else if (req.headers && req.headers.cookie) {
      const cookies = Object.fromEntries(req.headers.cookie.split(';').map(s => {
        const [k, ...v] = s.split('='); return [k.trim(), v.join('=').trim()];
      }));
      if (cookies.userInfo) {
        try { const u = JSON.parse(decodeURIComponent(cookies.userInfo)); if (u && u.id) userId = u.id; } catch (e) { }
      }
    }

    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    // Campos permitidos del formulario -> columnas DB
    const fieldMap = {
      fullname: 'Usu_Nombre',
      username: 'Usu_Alias',
      phone: 'Usu_Telefono',
      bio: 'Usu_Biografia',
      allergies: 'Ale_ID',
      preferences: 'Usu_Preferences',
      website: 'Usu_Website',

    };
    const profanityMessages = {
      Usu_Nombre: 'El nombre contiene palabras no permitidas.',
      Usu_Alias: 'El alias contiene palabras no permitidas.',
      Usu_Biografia: 'La biografía contiene palabras no permitidas.',
      Ale_ID: 'El campo de alergias contiene palabras no permitidas.',
      Usu_Preferences: 'El campo de preferencias contiene palabras no permitidas.',
      Usu_Website: 'El sitio web contiene palabras no permitidas.'
    };

    // Obtener columnas existentes en la tabla
    const dbName = resolverNombreBaseDatos();
    const cols = await authModel.obtenerNombresColumnasUsuarios(dbName);
    const existing = new Set(cols.map(c => c.COLUMN_NAME));

    // Construir SET dinámico solo con columnas existentes
    const setClauses = [];
    const values = [];
    // Antes de construir SET, validar alias si viene en el body
    if (Object.prototype.hasOwnProperty.call(req.body, 'username')) {
      const rawAlias = String(req.body.username || '').trim();
      // reglas: solo letras y números, >5 y <20 caracteres (6..19)
      const minLen = 6, maxLen = 19;
      if (rawAlias.length < minLen || rawAlias.length > maxLen) {
        return res.status(400).json({ error: `El alias debe tener entre ${minLen} y ${maxLen} caracteres.` });
      }
      if (!/^[A-Za-z0-9]+$/.test(rawAlias)) {
        return res.status(400).json({ error: 'El alias solo puede contener letras y números (sin espacios).' });
      }
      if (profanityFilter.containsProfanity(rawAlias)) {
        return res.status(400).json({ error: 'El alias contiene palabras no permitidas.' });
      }

      // verificar unicidad si la columna existe
      if (existing.has('Usu_Alias')) {
        const aliasTaken = await authModel.existeAliasParaOtroUsuarioSinProcesar(rawAlias, userId);
        if (aliasTaken) {
          return res.status(400).json({ error: 'El alias ya está en uso por otro usuario.' });
        }
      }
      // sustituir en req.body con valor normalizado
      req.body.username = rawAlias;
    }

    // Validación del nombre completo (fullname) si viene
    if (Object.prototype.hasOwnProperty.call(req.body, 'fullname')) {
      const rawName = String(req.body.fullname || '').trim();
      const minName = 20, maxName = 150;
      if (rawName.length < minName || rawName.length > maxName) {
        return res.status(400).json({ error: `El nombre debe tener entre ${minName} y ${maxName} caracteres.` });
      }
      // permitir letras unicode y espacios
      if (!/^[\p{L} ]+$/u.test(rawName)) {
        return res.status(400).json({ error: 'El nombre solo puede contener letras y espacios.' });
      }
      if (profanityFilter.containsProfanity(rawName)) {
        return res.status(400).json({ error: 'El nombre contiene palabras no permitidas.' });
      }
      req.body.fullname = rawName;
    }

    for (const [formKey, colName] of Object.entries(fieldMap)) {
      if (!existing.has(colName)) continue;
      let val = req.body[formKey];
      // enforce bio length
      if (formKey === 'bio' && typeof val === 'string') {
        if (val.length > 255) val = val.slice(0, 255);
      }
      if (formKey === 'preferences') {
        // puede venir como array o string
        if (Array.isArray(val)) val = val.join(',');
        else if (typeof val === 'undefined' || val === null) val = '';
      }
      if (typeof val !== 'undefined') {
        if (typeof val === 'string' && profanityMessages[colName] && profanityFilter.containsProfanity(val)) {
          return res.status(400).json({ error: profanityMessages[colName] });
        }
        setClauses.push(`${colName} = ?`);
        values.push(val);
      }
    }

    if (setClauses.length === 0) return res.status(400).json({ error: 'No hay campos actualizables disponibles' });

    await authModel.actualizarUsuarioPorId(userId, setClauses, values);

    return res.json({ ok: true });
  } catch (err) {
    console.error('Error en /actualizar-perfil:', err);
    return res.status(500).json({ error: 'Error interno al actualizar perfil' });
  }
};

router.post('/actualizar-perfil', procesarActualizacionPerfil);

// Middleware compartido para payloads JSON grandes de avatar
const avatarJsonParser = express.json({ limit: '10mb' });

// Endpoint para subir avatar como DataURL (base64) desde el cliente
const procesarSubidaAvatar = async (req, res) => {
  try {
    if (!req.session || !req.session.user) return res.status(401).json({ error: 'No autenticado' });

    const { image } = req.body || {};
    if (!image) return res.status(400).json({ error: 'No se recibió imagen' });

    // Data URL: data:<mime>;base64,<data>
    const matches = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i.exec(image);
    if (!matches) return res.status(400).json({ error: 'Formato de imagen no válido' });

    const mime = matches[1].toLowerCase();
    let ext = matches[2].toLowerCase();
    // normalizar jpeg->jpg
    if (ext === 'jpeg') ext = 'jpg';
    const base64Data = matches[3];

    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > LIMITE_BYTES_IMAGEN) return res.status(413).json({ error: 'Imagen demasiado grande' });

    const userId = req.session.user.id;
    const projectRoot = path.join(__dirname, '..');
    const uploadDir = path.join(projectRoot, 'Imagenes', 'Usuarios');
    try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) { /* ignore */ }

    const filename = `${userId}.${ext}`;
    const filePath = path.join(uploadDir, filename);

    // Escribir el fichero
    await fs.promises.writeFile(filePath, buffer);

    // Guardar ruta relativa en la BD (sin slash inicial) para que /api/usuario la normalice
    const dbPath = `Imagenes/Usuarios/${filename}`;
    try {
      await authModel.actualizarUsuarioFoto(userId, dbPath);
    } catch (dbErr) {
      console.error('Error actualizando Usu_Foto en BD:', dbErr);
      // No fallar la subida solo por un error de BD — devolver la ruta del archivo guardado
    }

    return res.json({ foto: '/' + dbPath });
  } catch (err) {
    console.error('Error en /subir-avatar:', err);
    return res.status(500).json({ error: 'Error interno al subir imagen' });
  }
};

router.post('/subir-avatar', avatarJsonParser, procesarSubidaAvatar);

// Endpoint para verificar disponibilidad de alias (consulta rápida)
router.get('/verificar-alias', async (req, res) => {
  try {
    const alias = (req.query.alias || '').trim();
    const excludeId = req.query.exclude ? parseInt(req.query.exclude, 10) : null;

    if (!alias) return res.status(400).json({ available: false, error: 'Alias requerido' });
    if (alias.length < 6 || alias.length > 19) return res.status(400).json({ available: false, error: 'El alias debe tener entre 6 y 19 caracteres' });
    if (!/^[A-Za-z0-9]+$/.test(alias)) return res.status(400).json({ available: false, error: 'El alias solo puede contener letras y números' });
    if (profanityFilter.containsProfanity(alias)) {
      return res.status(400).json({ available: false, error: 'El alias contiene palabras no permitidas' });
    }

    // Verificar que la columna exista
    const dbName = resolverNombreBaseDatos();
    const columns = await authModel.obtenerNombresColumnasUsuarios(dbName);
    const hasAliasColumn = columns.some((col) => col.COLUMN_NAME === 'Usu_Alias');
    if (!hasAliasColumn) return res.status(400).json({ available: false, error: 'La columna de alias no está disponible en la base de datos' });

    const normalizedExclude = Number.isInteger(excludeId) ? excludeId : null;
    let existingAliasRow = null;
    if (normalizedExclude) {
      existingAliasRow = await authModel.buscarUsuarioIdPorAliasExcluyendo(alias, normalizedExclude);
    } else {
      existingAliasRow = await authModel.buscarUsuarioIdPorAlias(alias);
    }

    if (existingAliasRow) return res.json({ available: false });
    return res.json({ available: true });
  } catch (err) {
    console.error('Error en /verificar-alias:', err);
    return res.status(500).json({ available: false, error: 'Error interno' });
  }
});

// Endpoint para eliminar la cuenta del usuario: borra la fila, borra avatar y destruye sesión
const procesarEliminacionCuenta = async (req, res) => {
  try {
    // Determinar userId como en otros endpoints
    const userId = obtenerIdUsuarioDeReq(req);

    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const deactivated = await userModel.desactivarUsuarioPorId(userId);
    if (!deactivated) {
      console.error('No se pudo marcar el usuario como inactivo');
      return res.status(500).json({ error: 'No se pudo eliminar la cuenta' });
    }

    try {
      await authModel.registrarRetencionUsuario(userId, 'inactivo');
    } catch (retentionErr) {
      console.warn('No se pudo programar eliminación por inactividad tras solicitud del usuario', retentionErr && retentionErr.message ? retentionErr.message : retentionErr);
    }

    if (firebaseAdmin) {
      try {
        const email = await userModel.obtenerCorreoPorId(userId);
        if (email) {
          const firebaseRecord = await firebaseAdmin.auth().getUserByEmail(email);
          await firebaseAdmin.auth().updateUser(firebaseRecord.uid, { disabled: true });
        }
      } catch (firebaseErr) {
        console.warn('No se pudo deshabilitar el usuario en Firebase:', firebaseErr && firebaseErr.message ? firebaseErr.message : firebaseErr);
      }
    }

    // Limpiar cookies y destruir sesión
    res.clearCookie('userInfo');
    res.clearCookie('connect.sid', { path: '/' });
    req.session.destroy((err) => {
      if (err) console.error('Error destruyendo sesión al eliminar cuenta:', err);
      // responder con redirección sugerida
      return res.json({ ok: true, redirect: '/' });
    });
  } catch (err) {
    console.error('Error en /eliminar-cuenta:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};

router.post('/eliminar-cuenta', procesarEliminacionCuenta);

router.post('/api/usuario/perfil/:identificador/seguir', async (req, res) => {
  try {
    const viewerIdRaw = obtenerIdUsuarioDeReq(req);
    const viewerId = viewerIdRaw != null ? Number(viewerIdRaw) : null;
    if (!viewerId || !Number.isFinite(viewerId)) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const identifier = (req.params.identificador || '').trim();
    const targetRow = await encontrarUsuarioPorIdentificador(identifier);
    if (!targetRow) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    const targetId = Number(targetRow.Usu_ID);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    if (viewerId === targetId) {
      return res.status(400).json({ error: 'No puedes seguirte a ti mismo' });
    }

    await userModel.seguirUsuario(viewerId, targetId);
    const followersCount = await userModel.obtenerConteoSeguidores(targetId);

    return res.json({ following: true, followers: followersCount });
  } catch (err) {
    console.error('Error en POST /api/usuario/perfil/:identificador/seguir', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'No se pudo seguir al usuario' });
  }
});

router.delete('/api/usuario/perfil/:identificador/seguir', async (req, res) => {
  try {
    const viewerIdRaw = obtenerIdUsuarioDeReq(req);
    const viewerId = viewerIdRaw != null ? Number(viewerIdRaw) : null;
    if (!viewerId || !Number.isFinite(viewerId)) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const identifier = (req.params.identificador || '').trim();
    const targetRow = await encontrarUsuarioPorIdentificador(identifier);
    if (!targetRow) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    const targetId = Number(targetRow.Usu_ID);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    if (viewerId === targetId) {
      return res.status(400).json({ error: 'No puedes dejar de seguirte a ti mismo' });
    }

    await userModel.dejarDeSeguirUsuario(viewerId, targetId);
    const followersCount = await userModel.obtenerConteoSeguidores(targetId);

    return res.json({ following: false, followers: followersCount });
  } catch (err) {
    console.error('Error en DELETE /api/usuario/perfil/:identificador/seguir', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'No se pudo dejar de seguir al usuario' });
  }
});

// Endpoint para obtener estadísticas del usuario
router.get('/api/usuario/estadisticas', async (req, res) => {
  try {
    const userId = obtenerIdUsuarioDeReq(req);
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    // Obtener estadísticas generales
    const stats = await authModel.obtenerEstadisticasUsuario(userId) || {};

    return res.json({
      avgRating: Number(stats.promedioCalificaciones) || 0,
      totalRecipes: Number(stats.recetasPublicadas) || 0,
      savedRecipes: Number(stats.recetasFavoritas) || 0,
      totalComments: Number(stats.comentariosRealizados) || 0
    });
  } catch (err) {
    console.error('Error en /api/usuario/estadisticas:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para obtener las recetas más populares del usuario
router.get('/api/usuario/recetas-populares', async (req, res) => {
  try {
    const userId = obtenerIdUsuarioDeReq(req);
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const recipes = await authModel.obtenerRecetasPopularesUsuario(userId);

    return res.json(recipes.map((recipe) => ({
      id: recipe.Rec_ID || null,
      titulo: recipe.Rec_Nombre || '',
      imagen: normalizarRutaPublica(recipe.imagenPortada, '/Imagenes/Recetas/1.png'),
      calificacion: Number(recipe.promedio) || 0,
      totalCalificaciones: Number(recipe.totalCalificaciones) || 0,
      fechaPublicacion: recipe.Rec_Fecha_Publicacion || null
    })));
  } catch (err) {
    console.error('Error en /api/usuario/recetas-populares:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para obtener la distribución de calificaciones del usuario
router.get('/api/usuario/distribucion-calificaciones', async (req, res) => {
  try {
    const userId = obtenerIdUsuarioDeReq(req);
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const distribution = await authModel.obtenerDistribucionCalificacionesUsuario(userId) || [];
    const counts = new Map();
    distribution.forEach((entry) => {
      const stars = Number(entry.puntuacion);
      if (!Number.isFinite(stars)) return;
      counts.set(stars, Number(entry.total) || 0);
    });

    return res.json([5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: counts.get(stars) || 0,
    })));
  } catch (err) {
    console.error('Error en /api/usuario/distribucion-calificaciones:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para obtener la actividad mensual del usuario
router.get('/api/usuario/actividad-mensual', async (req, res) => {
  try {
    const userId = obtenerIdUsuarioDeReq(req);
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const activity = await authModel.obtenerActividadMensualUsuario(userId) || [];

    return res.json(activity.map((item) => ({
      month: item.mes || '',
      activity: Number(item.totalRecetas) || 0,
    })));
  } catch (err) {
    console.error('Error en /api/usuario/actividad-mensual:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
