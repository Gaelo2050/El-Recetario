/**
 * =============================================================
 *  Controlador de Autenticación con Firebase
 * =============================================================
 *  Descripción:
 *    - Gestiona el registro, inicio/cierre de sesión, y recuperación de contraseña usando Firebase Auth.
 *    - Sincroniza usuarios con la base de datos local y valida datos sensibles (alias, nombre, teléfono, etc.).
 *    - Incluye validaciones de datos y filtro de palabras prohibidas en campos críticos.
 *
 *  Métodos principales:
 *    - registrarUsuario(req, res):   Registro de usuario con Firebase y BD local
 *    - iniciarSesion(req, res):      Inicio de sesión con Firebase y sincronización de sesión local
 *    - cerrarSesion(req, res):       Cierre de sesión (Firebase y cookies)
 *    - restablecerContrasena(req, res):  Restablecimiento de contraseña vía correo electrónico
 *
 *  Dependencias:
 *    - Firebase Auth, Firebase Admin, authModel, bcrypt, path, fs, profanityFilter
 *
 *  Notas de validación y seguridad:
 *    - Validación estricta de alias, nombre, teléfono y fecha de nacimiento
 *    - Filtro de palabras prohibidas en campos sensibles
 *    - Sincronización y rollback entre Firebase y BD local en caso de error
 *    - Respuestas y mensajes de error en español
 */
const {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    sendPasswordResetEmail,
    admin
} = require('../config/firebase');

const auth = getAuth();
const authModel = require('../models/authModel');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const profanityFilter = require('../config/profanityFilter');
const { Buffer } = require('buffer');

// Normaliza banderas booleanas para columnas BIT/TINYINT en MySQL
const toBitBuffer = (value) => Buffer.from([value ? 1 : 0]);
const parseBitValue = (value) => {
    if (Buffer.isBuffer(value)) {
        return value[0] ? 1 : 0;
    }
    if (Array.isArray(value) && value.length > 0) {
        const candidate = value[0];
        if (typeof candidate === 'number') return candidate ? 1 : 0;
        if (Buffer.isBuffer(candidate)) return candidate[0] ? 1 : 0;
    }
    if (typeof value === 'number') return value ? 1 : 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length === 1) {
            const code = trimmed.charCodeAt(0);
            if (code === 0) return 0;
            if (code === 1) return 1;
        }
        const parsed = Number(trimmed);
        if (!Number.isNaN(parsed)) return parsed ? 1 : 0;
    }
    return 0;
};

// Controlador para autenticación con Firebase
class FirebaseAuthController {

    // Controlador para registrar un nuevo usuario
    async registrarUsuario(req, res) {
        const { email, password, nombre, alias, Usu_Cum, genero, phone, tipo, ale } = req.body;
        if (!email || !password) {
            return res.status(422).json({
                email: 'El correo electrónico es obligatorio',
                password: 'La contraseña es obligatoria',
            });
        }
        const normalizedAlias = typeof alias === 'string' ? alias.trim() : '';
        if (!normalizedAlias) {
            return res.status(422).json({ error: 'El alias es obligatorio' });
        }
        if (!/^[A-Za-z0-9]{6,19}$/.test(normalizedAlias)) {
            return res.status(422).json({ error: 'El alias debe tener entre 6 y 19 caracteres y solo letras o números' });
        }
        if (profanityFilter.containsProfanity(normalizedAlias)) {
            return res.status(422).json({ error: 'El alias contiene palabras no permitidas' });
        }

        try {
            const aliasRow = await authModel.buscarUsuarioIdPorAlias(normalizedAlias);
            if (aliasRow) {
                return res.status(409).json({ error: 'El alias ya está en uso' });
            }
        } catch (aliasErr) {
            console.error('registrarUsuario: error al verificar la disponibilidad del alias:', aliasErr);
            return res.status(500).json({ error: 'Error verificando disponibilidad del alias' });
        }

        const normalizedPhone = typeof phone === 'string' ? phone.replace(/\D/g, '') : (typeof phone === 'number' ? String(phone) : '');
        const normalizedNombre = typeof nombre === 'string' ? nombre.trim() : '';
        if (normalizedNombre && profanityFilter.containsProfanity(normalizedNombre)) {
            return res.status(422).json({ error: 'El nombre contiene palabras no permitidas' });
        }

        const birthDate = (() => {
            if (!Usu_Cum) return null;
            const parsed = new Date(Usu_Cum);
            if (Number.isNaN(parsed.getTime())) return null;
            return parsed.toISOString().slice(0, 10);
        })();

        if (!birthDate) {
            return res.status(422).json({ error: 'La fecha de nacimiento es obligatoria' });
        }

        if (!normalizedNombre) {
            return res.status(422).json({ error: 'El nombre es obligatorio' });
        }

        if (!normalizedPhone || normalizedPhone.length !== 10) {
            return res.status(422).json({ error: 'El teléfono debe tener exactamente 10 dígitos' });
        }

        const cerrarSesionSeguro = async () => {
            try {
                if (auth.currentUser) {
                    await signOut(auth);
                }
            } catch (signOutErr) {
                console.debug('registrarUsuario: cierre de sesión seguro omitido', signOutErr && signOutErr.message ? signOutErr.message : signOutErr);
            }
        };

        let userCredential = null;
        let createdFirebaseUid = null;
        try {
            userCredential = await createUserWithEmailAndPassword(auth, email, password);
            createdFirebaseUid = userCredential && userCredential.user ? userCredential.user.uid : null;
        } catch (firebaseErr) {
            console.error('registrarUsuario: error al crear el usuario en Firebase:', firebaseErr);
            const firebaseCode = firebaseErr && firebaseErr.code ? firebaseErr.code : null;
            const mappedError = (() => {
                switch (firebaseCode) {
                    case 'auth/email-already-in-use':
                        return { status: 409, message: 'El correo electrónico ya está en uso' };
                    case 'auth/invalid-email':
                        return { status: 422, message: 'El correo electrónico no es válido' };
                    case 'auth/weak-password':
                        return { status: 422, message: 'La contraseña debe tener al menos 6 caracteres' };
                    default:
                        return null;
                }
            })();

            await cerrarSesionSeguro();
            if (mappedError) {
                return res.status(mappedError.status).json({ error: mappedError.message });
            }
            return res.status(500).json({ error: 'No fue posible crear el usuario en Firebase.' });
        }

        try {
            const hash = await bcrypt.hash(password, 10);
            const maxUserId = await authModel.obtenerMaximoUsuarioId();
            const nextId = (Number.isFinite(maxUserId) ? maxUserId : 0) + 1;

            const generoLower = String(genero || '').toLowerCase();
            let normalizedGenero = 'O';
            if (generoLower.startsWith('m')) normalizedGenero = 'M';
            else if (generoLower.startsWith('f')) normalizedGenero = 'F';

            const tipoId = (() => {
                const parsed = parseInt(tipo, 10);
                return Number.isInteger(parsed) && parsed > 0 ? parsed : 2;
            })();

            const aleId = (() => {
                const parsed = parseInt(ale, 10);
                return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
            })();

            const rawPhotoRelativePath = `Imagenes/Usuarios/${nextId}.png`;
            const userPhotoRelativePath = rawPhotoRelativePath.replace(/^\/+/, '');
            const defaultPhotoPath = path.join(__dirname, '..', 'Imagenes', 'Usuarios', '0.png');
            const destinationPhotoPath = path.join(__dirname, '..', userPhotoRelativePath);

            try {
                await fsp.mkdir(path.dirname(destinationPhotoPath), { recursive: true });
                await fsp.copyFile(defaultPhotoPath, destinationPhotoPath);
            } catch (copyErr) {
                console.warn('registrarUsuario: no se pudo copiar el avatar predeterminado para el usuario', nextId, copyErr && copyErr.message ? copyErr.message : copyErr);
            }

            const colsToInsert = [
                'Usu_ID',
                'Usu_Nombre',
                'Usu_Alias',
                'Usu_Cum',
                'Usu_Telefono',
                'Usu_Email',
                'Usu_Contraseña',
                'Usu_Foto',
                'Usu_Genero',
                'Usu_Verificado',
                'Usu_Activo',
                'Tipo_Usu_ID',
                'Ale_ID'
            ];

            const values = [
                nextId,
                normalizedNombre,
                normalizedAlias,
                birthDate,
                normalizedPhone,
                email,
                hash,
                userPhotoRelativePath,
                normalizedGenero,
                toBitBuffer(false),
                toBitBuffer(true),
                tipoId,
                aleId
            ];

            await authModel.insertarUsuario(colsToInsert, values);
            try {
                await authModel.registrarRetencionUsuario(nextId, 'no_verificado');
            } catch (retentionErr) {
                console.warn('registrarUsuario: no se pudo programar la eliminación por falta de verificación', retentionErr && retentionErr.message ? retentionErr.message : retentionErr);
            }
        } catch (dbErr) {
            console.error('registrarUsuario: error al insertar el usuario en la base de datos después de crearlo en Firebase:', dbErr);
            if (createdFirebaseUid) {
                try {
                    await admin.auth().deleteUser(createdFirebaseUid);
                    console.debug('registrarUsuario: usuario de Firebase revertido', createdFirebaseUid);
                } catch (deleteErr) {
                    console.error('registrarUsuario: no se pudo revertir el usuario de Firebase', deleteErr);
                }
            }
            await cerrarSesionSeguro();
            return res.status(500).json({ error: 'Error guardando el usuario en la base de datos.' });
        }

        let verificationEmailSent = false;
        let verificationLinkFallback = null;
        try {
            if (userCredential && userCredential.user) {
                const verificationRedirect = process.env.FIREBASE_EMAIL_VERIFICATION_REDIRECT;
                if (verificationRedirect) {
                    await sendEmailVerification(userCredential.user, { url: verificationRedirect });
                } else {
                    await sendEmailVerification(userCredential.user);
                }
                verificationEmailSent = true;
            }
        } catch (verifyErr) {
            console.error('registrarUsuario: no se pudo enviar el correo de verificación', verifyErr);
            try {
                verificationLinkFallback = await admin.auth().generateEmailVerificationLink(email);
            } catch (linkErr) {
                console.error('registrarUsuario: no se pudo generar el enlace alternativo de verificación', linkErr);
            }
        }

        await cerrarSesionSeguro();

        const responsePayload = {
            message: verificationEmailSent
                ? 'Usuario creado exitosamente. Revisa tu correo para validar la cuenta.'
                : 'Usuario creado exitosamente, pero hubo un problema al enviar el correo de verificación.'
        };

        if (!verificationEmailSent && verificationLinkFallback) {
            responsePayload.verificationLink = verificationLinkFallback;
            responsePayload.notice = 'Utiliza este enlace para verificar tu cuenta manualmente.';
        } else if (!verificationEmailSent) {
            responsePayload.notice = 'Solicita un nuevo correo de verificación más tarde o contacta con soporte.';
        }

        return res.status(201).json(responsePayload);
    }
    // Controlador para iniciar sesión
    async iniciarSesion(req, res) {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(422).json({
                email: 'El correo electrónico es obligatorio',
                password: 'La contraseña es obligatoria',
            });
        }

        let dbUser;
        try {
            dbUser = await authModel.buscarUsuarioConTipoPorEmail(email);
        } catch (dbLookupErr) {
            console.error('iniciarSesion: error consultando el usuario en la base de datos:', dbLookupErr);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }

        if (!dbUser) {
            return res.status(401).json({ error: 'Correo o contraseñas incorrectos BD.' });
        }

        const usuarioActivo = parseBitValue(dbUser.Usu_Activo) === 1;
        if (!usuarioActivo) {
            return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta con soporte para rehabilitarla.' });
        }

        let passwordMatches = false;
        try {
            passwordMatches = await bcrypt.compare(password, dbUser.Usu_Contraseña);
        } catch (hashErr) {
            console.error('iniciarSesion: error comparando contraseñas:', hashErr);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }

        const cerrarSesionFirebase = async () => {
            try {
                if (auth.currentUser) {
                    await signOut(auth);
                }
            } catch (signOutErr) {
                console.debug('iniciarSesion: cierre de sesión seguro omitido', signOutErr && signOutErr.message ? signOutErr.message : signOutErr);
            }
        };

        let userCredential;
        try {
            userCredential = await signInWithEmailAndPassword(auth, email, password);
        } catch (firebaseErr) {
            console.error('iniciarSesion: error al autenticar en Firebase:', firebaseErr);
            const firebaseCode = firebaseErr && firebaseErr.code ? firebaseErr.code : null;
            if (firebaseCode === 'auth/invalid-credential' || firebaseCode === 'auth/user-not-found') {
                if (passwordMatches) {
                    return res.status(500).json({ error: 'Las credenciales no están sincronizadas. Contacta a soporte.' });
                }
                return res.status(401).json({ error: 'Correo o contraseñas incorrectos.' });
            }
            return res.status(500).json({ error: 'No fue posible iniciar sesión en Firebase.' });
        }

        try {
            const firebaseUser = userCredential && userCredential.user ? userCredential.user : null;
            if (!firebaseUser) {
                await cerrarSesionFirebase();
                return res.status(500).json({ error: 'No fue posible obtener el usuario de Firebase' });
            }

            if (!passwordMatches) {
                try {
                    const newHash = await bcrypt.hash(password, 10);
                    await authModel.actualizarUsuarioPorId(dbUser.Usu_ID, ['Usu_Contraseña = ?'], [newHash]);
                    dbUser.Usu_Contraseña = newHash;
                    passwordMatches = true;
                } catch (syncErr) {
                    console.error('iniciarSesion: no se pudo sincronizar la contraseña en la base de datos tras el cambio en Firebase:', syncErr && syncErr.message ? syncErr.message : syncErr);
                }
            }

            try {
                await firebaseUser.reload();
            } catch (reloadErr) {
                console.warn('iniciarSesion: no se pudo recargar el usuario de Firebase', reloadErr && reloadErr.message ? reloadErr.message : reloadErr);
            }

            if (!firebaseUser.emailVerified) {
                try {
                    await sendEmailVerification(firebaseUser);
                } catch (resendErr) {
                    console.warn('iniciarSesion: fallo al reenviar el correo de verificación', resendErr && resendErr.message ? resendErr.message : resendErr);
                    await cerrarSesionFirebase();
                    return res.status(429).json({ error: 'Demasiados intentos fallidos. Por favor espera unos minutos antes de volver a intentar, si el problema persiste comunicate con soporte.' });
                }
                await cerrarSesionFirebase();
                return res.status(403).json({ error: 'Debes verificar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada o spam.' });
            }

            const idToken = userCredential && userCredential._tokenResponse && userCredential._tokenResponse.idToken;
            if (!idToken) {
                await cerrarSesionFirebase();
                return res.status(500).json({ error: 'Error interno del servidor' });
            }

            res.cookie('access_token', idToken, { httpOnly: true });

            if (firebaseUser.emailVerified) {
                let verifiedNumeric = parseBitValue(dbUser.Usu_Verificado);
                let activoNumeric = parseBitValue(dbUser.Usu_Activo);
                if (verifiedNumeric !== 1) {
                    try {
                        await authModel.actualizarUsuarioPorId(dbUser.Usu_ID, ['Usu_Verificado = ?'], [toBitBuffer(true)]);
                        verifiedNumeric = 1;
                        dbUser.Usu_Verificado = 1;
                    } catch (updateErr) {
                        console.error('iniciarSesion: no se pudo marcar al usuario como verificado en la base de datos:', updateErr && updateErr.message ? updateErr.message : updateErr);
                    }
                } else {
                    dbUser.Usu_Verificado = 1;
                }

                dbUser.Usu_Activo = activoNumeric;

                if (req && req.session) {
                    const tipoNumeric = Number(dbUser.Tipo_Usu_ID);
                    req.session.user = {
                        id: dbUser.Usu_ID,
                        nombre: dbUser.Usu_Nombre,
                        alias: dbUser.Usu_Alias || '',
                        Usu_Verificado: verifiedNumeric === 1 ? 1 : 0,
                        Usu_Activo: activoNumeric === 1 ? 1 : 0,
                    };
                    if (Number.isFinite(tipoNumeric)) {
                        req.session.user.Tipo_Usu_ID = tipoNumeric;
                    }
                    try {
                        const cookiePayload = {
                            nombre: dbUser.Usu_Nombre,
                            id: dbUser.Usu_ID,
                            Usu_Verificado: verifiedNumeric === 1 ? 1 : 0,
                            Usu_Activo: activoNumeric === 1 ? 1 : 0,
                        };
                        if (Number.isFinite(tipoNumeric)) {
                            cookiePayload.Tipo_Usu_ID = tipoNumeric;
                        }
                        res.cookie('userInfo', JSON.stringify(cookiePayload), { httpOnly: false });
                    } catch (cookieErr) {
                        console.debug('iniciarSesion: no se pudo establecer la cookie userInfo', cookieErr && cookieErr.message ? cookieErr.message : cookieErr);
                    }
                }

                try {
                    await authModel.limpiarRetencionUsuario(dbUser.Usu_ID, 'no_verificado');
                } catch (retentionErr) {
                    console.warn('iniciarSesion: no se pudo limpiar el temporizador de verificación', retentionErr && retentionErr.message ? retentionErr.message : retentionErr);
                }
            }

            return res.status(200).json({ message: 'Inicio de sesión exitoso.', user: dbUser, Fe: { uid: firebaseUser && firebaseUser.uid } });
        } catch (err) {
            console.error('iniciarSesion: error inesperado tras autenticación en Firebase:', err);
            await cerrarSesionFirebase();
            return res.status(500).json({ error: err.message || 'Error interno del servidor' });
        }
    }
    // Controlador para cerrar sesión
    cerrarSesion(req, res) {
        signOut(auth)
            .then(() => {
                res.clearCookie('access_token');
                res.status(200).json({ message: 'Sesión cerrada correctamente' });
            })
            .catch((error) => {
                console.error(error);
                res.status(500).json({ error: 'Error interno del servidor' });
            });
    }

    // Controlador para restablecer la contraseña
    restablecerContrasena(req, res) {
        (async () => {
            try {
                let { email } = req.body || {};

                // Si no se ha proporcionado ningún correo electrónico, intente resolverlo a partir de la sesión o la cookie.
                if (!email) {
                    if (req && req.session && req.session.user && req.session.user.id) {
                        const userId = req.session.user.id;
                        const userBasic = await authModel.obtenerUsuarioBasicoPorId(userId);
                        if (userBasic && userBasic.Usu_Email) email = userBasic.Usu_Email;
                    } else if (req && req.headers && req.headers.cookie) {
                        // análisis de cookies de respaldo como en otros controladores
                        const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(s => { const [k, ...v] = s.split('='); return [k.trim(), v.join('=').trim()]; }));
                        if (cookies.userInfo) {
                            try {
                                const u = JSON.parse(decodeURIComponent(cookies.userInfo));
                                if (u && u.id) {
                                    const userBasic = await authModel.obtenerUsuarioBasicoPorId(u.id);
                                    if (userBasic && userBasic.Usu_Email) email = userBasic.Usu_Email;
                                }
                            } catch (e) {

                            }
                        }
                    }
                }

                if (!email) return res.status(422).json({ error: 'El correo electrónico es obligatorio' });

                // Prefiero pedirle a Firebase que envíe el correo electrónico a través de la API REST si hay una clave API disponible.
                const apiKey = process.env.FIREBASE_API_KEY;
                if (apiKey) {
                    const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`;
                    // Realizar una solicitud del lado del servidor a la API REST de Firebase para activar el correo electrónico.
                    let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
                    if (!fetchImpl) {
                        // intentar requerir node-fetch como respaldo
                        try { fetchImpl = require('node-fetch'); } catch (e) { fetchImpl = null; }
                    }
                    if (!fetchImpl) {
                        // fallback a Admin SDK para generar el enlace
                        const admin = require('../config/firebase').admin;
                        try {
                            const link = await admin.auth().generatePasswordResetLink(email);
                            return res.status(200).json({ message: 'Enlace de restablecimiento generado', link });
                        } catch (e) {
                            console.error('restablecerContrasena: no se pudo generar el enlace de restablecimiento', e);
                            return res.status(500).json({ error: 'No se pudo enviar el correo de restablecimiento' });
                        }
                    }

                    const body = { requestType: 'PASSWORD_RESET', email };
                    const r = await fetchImpl(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    const data = await r.json().catch(() => ({}));
                    if (r.ok) {
                        return res.status(200).json({ message: 'Correo de restablecimiento enviado correctamente' });
                    } else {
                        console.error('restablecerContrasena: error al invocar la API REST de Firebase sendOobCode:', data);
                        // Si el correo electrónico no se encuentra u otro error, mostrar un mensaje razonable
                        const errMsg = (data && data.error && data.error.message) ? data.error.message : 'No se pudo enviar el correo de restablecimiento';
                        return res.status(500).json({ error: errMsg });
                    }
                } else {
                    // Sin clave API: intentar generar un enlace con Admin SDK y devolverlo para que el frontend pueda manejarlo
                    const admin = require('../config/firebase').admin;
                    try {
                        const link = await admin.auth().generatePasswordResetLink(email);
                        return res.status(200).json({ message: 'Enlace de restablecimiento generado', link });
                    } catch (e) {
                        console.error('restablecerContrasena: no se pudo generar el enlace de restablecimiento', e);
                        return res.status(500).json({ error: 'No se pudo enviar el correo de restablecimiento' });
                    }
                }
            } catch (e) {
                console.error('Error en restablecerContrasena:', e);
                return res.status(500).json({ error: 'Error interno del servidor' });
            }
        })();
    }
}

module.exports = new FirebaseAuthController();