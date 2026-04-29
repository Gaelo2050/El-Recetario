/**
 * =============================================================
 *  Controlador de Pagos y Suscripciones (Stripe)
 * =============================================================
 *  Descripción:
 *    - Gestiona la integración con Stripe para pagos, suscripciones y portal de facturación.
 *    - Proporciona endpoints para crear sesiones de pago, portal de usuario, manejar webhooks y mostrar éxito/cancelación.
 *    - Sincroniza el estado de suscriptor en la base de datos local tras eventos de Stripe.
 *
 *  Funciones principales:
 *    - crearSesionPago(req, res):         Crea sesión de pago/suscripción
 *    - crearSesionPortal(req, res):       Portal de gestión de suscripción Stripe
 *    - procesarWebhook(request, response): Manejo de eventos Stripe (checkout, suscripción)
 *    - exito(req, res):                   Página de éxito tras pago
 *
 *  Dependencias:
 *    - stripe, userModel, path
 *
 *  Notas de seguridad y validación:
 *    - Validación de claves y parámetros de Stripe
 *    - Manejo seguro de webhooks y verificación de firma
 *    - Sincronización de estado de usuario tras eventos de pago
 *    - Manejo de errores y logs detallados
 */
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const userModel = require('../models/userModel');

const YOUR_DOMAIN = process.env.YOUR_DOMAIN || 'http://localhost:3000';
const USER_INFO_COOKIE_OPTIONS = { httpOnly: false, sameSite: 'Lax', path: '/' };

const resolverVista = (view) => path.join(__dirname, '..', 'views', view);

const normalizarIdUsuario = (value) => {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const decodeUserInfoCookie = (rawCookie) => {
  if (!rawCookie) return null;
  try {
    if (typeof rawCookie === 'string') {
      return JSON.parse(decodeURIComponent(rawCookie));
    }
    return rawCookie;
  } catch (error) {
    console.warn('[paymentsController] cookie userInfo inválida:', error && error.message ? error.message : error);
    return null;
  }
};

const resolverContextoUsuario = (req) => {
  if (!req) return null;

  if (req.session && req.session.user && req.session.user.id) {
    const id = normalizarIdUsuario(req.session.user.id);
    if (id !== null) {
      return {
        id,
        nombre: req.session.user.nombre || '',
        tipo: normalizarIdUsuario(req.session.user.Tipo_Usu_ID),
      };
    }
  }

  const parsedCookie = decodeUserInfoCookie(req.cookies && req.cookies.userInfo);
  if (parsedCookie && parsedCookie.id) {
    const id = normalizarIdUsuario(parsedCookie.id);
    if (id !== null) {
      return {
        id,
        nombre: parsedCookie.nombre || '',
        tipo: normalizarIdUsuario(parsedCookie.Tipo_Usu_ID),
      };
    }
  }

  return null;
};

const hidratarSesionDesdeContexto = (req, contexto) => {
  if (!req || !contexto || !req.session) return;
  req.session.user = req.session.user || {};
  if (contexto.id && !req.session.user.id) req.session.user.id = contexto.id;
  if (contexto.nombre && !req.session.user.nombre) req.session.user.nombre = contexto.nombre;
  if (contexto.tipo !== null) req.session.user.Tipo_Usu_ID = contexto.tipo;
};

const upsertarClienteStripe = async (email) => {
  if (!email) return null;
  try {
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing && existing.data && existing.data.length) {
      return existing.data[0];
    }
    return await stripe.customers.create({ email });
  } catch (error) {
    console.warn('error en upsertStripeCustomer:', error && error.message ? error.message : error);
    return null;
  }
};

const crearSesionPago = async (req, res) => {
  try {
    const { lookup_key: lookupKey, price_id: rawPriceId } = req.body || {};
    let priceId = rawPriceId;
    const userContext = resolverContextoUsuario(req);

    if (!userContext || !userContext.id) {
      return res.status(401).send('Debes iniciar sesión para suscribirte.');
    }

    hidratarSesionDesdeContexto(req, userContext);

    if (!priceId) {
      if (!lookupKey) {
        return res.status(400).send('Se requiere lookup_key o price_id');
      }
      const prices = await stripe.prices.list({ lookup_keys: [lookupKey], expand: ['data.product'] });
      if (!prices || !prices.data || !prices.data.length) {
        return res.status(400).send('No se encontró un precio para el lookup_key indicado');
      }
      priceId = prices.data[0].id;
    }

    if (priceId === 'price_monthly_id') {
      if (!process.env.PRICE_MONTHLY_ID) {
        return res.status(500).send('Error de configuración del servidor: PRICE_MONTHLY_ID no está definido');
      }
      priceId = process.env.PRICE_MONTHLY_ID;
    }

    if (priceId === 'price_annual_id') {
      if (!process.env.PRICE_ANNUAL_ID) {
        return res.status(500).send('Error de configuración del servidor: PRICE_ANNUAL_ID no está definido');
      }
      priceId = process.env.PRICE_ANNUAL_ID;
    }

    const sessionPayload = {
      billing_address_collection: 'auto',
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${YOUR_DOMAIN}/exito?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${YOUR_DOMAIN}/cancelar`,
    };

    sessionPayload.metadata = { userId: String(userContext.id) };
    const resolvedEmail = await userModel.obtenerCorreoPorId(userContext.id);

    if (resolvedEmail) {
      sessionPayload.metadata = Object.assign({}, sessionPayload.metadata, { userEmail: resolvedEmail });
      const customer = await upsertarClienteStripe(resolvedEmail);
      if (customer && customer.id) {
        sessionPayload.customer = customer.id;
        await userModel.actualizarIdClienteStripe(userContext.id, customer.id);
      } else {
        sessionPayload.customer_email = resolvedEmail;
      }
    }

    sessionPayload.client_reference_id = String(userContext.id);

    const session = await stripe.checkout.sessions.create(sessionPayload);
    return res.redirect(303, session.url);
  } catch (error) {
    console.error('error en crearSesionPago:', error && error.message ? error.message : error);
    if (error && error.raw) console.error('error raw de stripe:', error.raw);
    if (error && error.type) console.error('tipo de error de stripe:', error.type);
    return res.status(500).send(`Error al crear la sesión de pago: ${error && error.message ? error.message : 'desconocido'}`);
  }
};

const crearSesionPortal = async (req, res) => {
  try {
    const { session_id: sessionId } = req.body || {};
    if (!sessionId) {
      return res.status(400).send('Se requiere session_id');
    }

    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
    if (!checkoutSession || !checkoutSession.customer) {
      return res.status(400).send('Sesión de pago inválida');
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: checkoutSession.customer,
      return_url: YOUR_DOMAIN,
    });

    return res.redirect(303, portalSession.url);
  } catch (error) {
    console.error('error en crearSesionPortal:', error && error.message ? error.message : error);
    return res.status(500).send('Error al crear la sesión del portal');
  }
};

const manejarActualizarUsuarioASuscriptor = async (userId) => {
  if (!userId) return;
  try {
    await userModel.ascenderASuscriptor(userId);
  } catch (error) {
    console.error('error en manejarActualizarUsuarioASuscriptor:', error && error.message ? error.message : error);
  }
};

const sincronizarUsuarioPremium = async (req, res, candidateId) => {
  let resolvedId = normalizarIdUsuario(candidateId)
    || normalizarIdUsuario(req && req.session && req.session.user && req.session.user.id);

  if (!resolvedId) {
    const context = resolverContextoUsuario(req);
    if (context && context.id) {
      resolvedId = context.id;
    }
  }

  if (!resolvedId) return null;

  await manejarActualizarUsuarioASuscriptor(resolvedId);

  if (req && req.session && req.session.user) {
    const sessionUserId = normalizarIdUsuario(req.session.user.id);
    if (sessionUserId === resolvedId) {
      req.session.user.Tipo_Usu_ID = 3;
      try {
        await new Promise((resolve, reject) => {
          if (typeof req.session.save !== 'function') {
            resolve();
            return;
          }
          req.session.save((err) => (err ? reject(err) : resolve()));
        });
      } catch (error) {
        console.warn('No se pudo guardar la sesión tras actualizar el tipo de usuario a premium:', error && error.message ? error.message : error);
      }
    }
  }

  if (res && typeof res.cookie === 'function') {
    const context = resolverContextoUsuario(req) || { id: resolvedId };
    const payload = {
      id: resolvedId,
      nombre: context && context.nombre ? context.nombre : 'Chef',
      Tipo_Usu_ID: 3,
    };
    try {
      res.cookie('userInfo', JSON.stringify(payload), USER_INFO_COOKIE_OPTIONS);
    } catch (cookieErr) {
      console.warn('No se pudo actualizar la cookie userInfo tras el upgrade premium:', cookieErr && cookieErr.message ? cookieErr.message : cookieErr);
    }
  }

  return resolvedId;
};

const resolverIdUsuarioDeSuscripcion = async (subscription) => {
  if (!subscription) return null;
  if (subscription.metadata && subscription.metadata.userId) {
    return subscription.metadata.userId;
  }

  if (!subscription.latest_invoice) {
    return null;
  }

  try {
    const invoice = await stripe.invoices.retrieve(subscription.latest_invoice, { expand: ['billing_reason', 'lines'] });
    if (!invoice || !invoice.checkout_session) {
      return null;
    }
    const checkoutSession = await stripe.checkout.sessions.retrieve(invoice.checkout_session);
    return (checkoutSession.metadata && checkoutSession.metadata.userId) || checkoutSession.client_reference_id || null;
  } catch (error) {
    console.error('error al resolver el identificador de usuario desde la suscripción:', error && error.message ? error.message : error);
    return null;
  }
};

const procesarWebhook = async (request, response) => {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event = request.body;

  if (endpointSecret) {
    try {
      const signature = request.headers['stripe-signature'];
      const rawBody = request.rawBody || request.body;
      event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
    } catch (error) {
      console.log('⚠️  Falló la verificación de firma del webhook.', error && error.message ? error.message : error);
      return response.sendStatus(400);
    }
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = (session.metadata && session.metadata.userId) || session.client_reference_id;
        await manejarActualizarUsuarioASuscriptor(userId);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = await resolverIdUsuarioDeSuscripcion(subscription);
        if (userId) {
          await manejarActualizarUsuarioASuscriptor(userId);
        }
        break;
      }
      default:
        console.log(`Tipo de evento no manejado ${event.type}.`);
    }
  } catch (error) {
    console.error('error en el manejador de webhook:', error && error.message ? error.message : error);
  }

  return response.send();
};

const exito = async (req, res) => {
  const sessionId = req.query && req.query.session_id;
  if (!sessionId) {
    return res.redirect('/');
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription', 'customer'] });
    const paid = checkoutSession && checkoutSession.payment_status === 'paid';
    const hasSubscription = checkoutSession && Boolean(checkoutSession.subscription);

    if (paid || hasSubscription) {
      const checkoutUserId = (checkoutSession.metadata && checkoutSession.metadata.userId)
        || checkoutSession.client_reference_id
        || null;
      await sincronizarUsuarioPremium(req, res, checkoutUserId);
      return res.sendFile(resolverVista('success.html'));
    }

    return res.redirect('/cancel');
  } catch (error) {
    console.error('error en la ruta de éxito:', error && error.message ? error.message : error);
    return res.redirect('/cancel');
  }
};

module.exports = {
  crearSesionPago,
  crearSesionPortal,
  procesarWebhook,
  exito,
};
