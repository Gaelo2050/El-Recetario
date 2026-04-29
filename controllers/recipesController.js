/**
 * =============================================================
 *  Controlador de Recetas
 * =============================================================
 *  Descripción:
 *    - Gestiona la creación, consulta, edición y reporte de recetas.
 *    - Proporciona endpoints para comentarios, favoritos, puntuaciones, búsqueda y opciones de catálogo.
 *    - Incluye validaciones de datos y filtro de palabras prohibidas en campos sensibles.
 *
 *  Funciones principales:
 *    - renderizarDetalleReceta(req, res):         Renderiza detalle de receta
 *    - obtenerComentariosReceta(req, res):          Obtiene comentarios de receta
 *    - obtenerRecetasRelacionadas(req, res):          Obtiene recetas relacionadas
 *    - publicarComentarioReceta(req, res):          Publica comentario en receta
 *    - eliminarComentarioReceta(req, res):        Elimina comentario de receta
 *    - crearReporte(req, res):               Crea reporte sobre receta, comentario o usuario
 *    - obtenerResumenReceta(req, res):           Obtiene resumen de calificaciones y favoritos
 *    - calificarReceta(req, res):                 Puntuación de receta
 *    - marcarFavoritaReceta/removeFavoriteRecipe:  Marca/desmarca receta como favorita
 *    - buscarRecetas(req, res):              Búsqueda avanzada de recetas
 *    - obtenerOpcionesReceta(req, res):           Catálogo de categorías, tipos, ingredientes y utensilios
 *    - crearReceta(req, res):               Crea nueva receta
 *    - renderizarListaRecetas(req, res):          Renderiza lista de recetas
 *    - obtenerRecetasGuardadas(req, res):            Obtiene recetas guardadas del usuario
 *
 *  Dependencias:
 *    - recipesModel, recipeImageStorage, profanityFilter, path, fs, crypto
 *
 *  Notas de validación y seguridad:
 *    - Validación estricta de datos en creación y edición
 *    - Filtro de palabras prohibidas en campos sensibles
 *    - Control de acceso por sesión y tipo de usuario
 *    - Manejo de transacciones y rollback en operaciones críticas
 *    - Respuestas y mensajes de error en español
 */
const path = require('path');
const fsp = require('fs').promises;
const crypto = require('crypto');
const recipesModel = require('../models/recipesModel');
const { saveRecipeImageFromDataUrl, MAX_IMAGES_PER_RECIPE } = require('../utils/recipeImageStorage');
const profanityFilter = require('../config/profanityFilter');

const errorMessages = {
	autenticacion_requerida: 'Autenticación requerida. Inicia sesión para continuar.',
	nombre_invalido: 'Ingresa un nombre de receta válido (mínimo 3 caracteres).',
	nombre_contiene_palabras_inapropiadas: 'El nombre contiene palabras inapropiadas.',
	categoria_invalida: 'Selecciona una categoría válida.',
	dificultad_invalida: 'Selecciona una dificultad entre 1 y 10.',
	porciones_invalidas: 'Ingresa un número de porciones válido (1-50).',
	pasos_invalidos: 'Agrega al menos un paso de preparación.',
	pasos_contienen_lenguaje_inapropiado: 'Los pasos incluyen lenguaje inapropiado.',
	utensilios_contienen_palabras_inapropiadas: 'Utensilios contienen palabras inapropiadas.',
	descripcion_invalida: 'Escribe una descripción de al menos 10 caracteres.',
	descripcion_contiene_palabras_inapropiadas: 'La descripción contiene palabras inapropiadas.',
	categoria_no_encontrada: 'La categoría seleccionada no existe.',
	tipo_de_receta_no_encontrado: 'El tipo de receta seleccionado no existe.',
	ingredientes_invalidos: 'Agrega al menos un ingrediente con nombre válido.',
	ingredientes_contienen_palabras_inapropiadas: 'Ingredientes contienen palabras inapropiadas.',
	formato_de_imagen_invalido: 'Formato de imagen inválido.',
	demasiadas_imagenes: 'Solo puedes subir hasta 5 imágenes por receta.',
	imagen_demasiado_grande: 'Una de las imágenes supera el tamaño máximo permitido (5 MB).',
	ruta_de_imagen_demasiado_larga: 'Ruta de imagen demasiado larga.',
	fallo_al_crear_la_receta: 'No se pudo crear la receta. Inténtalo de nuevo.',
};

const randomUUID = crypto.randomUUID ? () => crypto.randomUUID() : () => crypto.randomBytes(16).toString('hex');

const analizarCookieUsuario = (raw) => {
	if (!raw) return null;
	if (typeof raw !== 'string') return raw;
	try {
		return JSON.parse(raw);
	} catch (err) {
		try {
			return JSON.parse(decodeURIComponent(raw));
		} catch (decodeErr) {
			return null;
		}
	}
};

const obtenerIdUsuarioSesion = (req) => {
	if (req.session && req.session.user && req.session.user.id) {
		const numericId = Number(req.session.user.id);
		if (Number.isFinite(numericId)) return numericId;
	}
	if (req.cookies && req.cookies.userInfo) {
		const parsed = analizarCookieUsuario(req.cookies.userInfo);
		if (parsed) {
			const numericId = Number(parsed.id || parsed.Usu_ID);
			if (Number.isFinite(numericId)) {
				req.session = req.session || {};
				req.session.user = req.session.user || {};
				if (!req.session.user.id) req.session.user.id = numericId;
				if (parsed.nombre && !req.session.user.nombre) req.session.user.nombre = parsed.nombre;
				const parsedTipo = parsed.Tipo_Usu_ID;
				const parsedTipoNumeric = Number(parsedTipo);
				if (Number.isFinite(parsedTipoNumeric)) {
					req.session.user.Tipo_Usu_ID = parsedTipoNumeric;
				}
				return numericId;
			}
		}
	}
	return null;
};

const requerirIdUsuarioSesion = (req, res) => {
	const userId = obtenerIdUsuarioSesion(req);
	if (!userId) {
		res.status(401).json({ error: errorMessages.autenticacion_requerida });
		return null;
	}
	return userId;
};

const obtenerTipoUsuarioSesion = async (req, userIdOverride = null) => {
	const fromSession = req && req.session && req.session.user
		? req.session.user.Tipo_Usu_ID
		: null;
	const sessionNumeric = Number(fromSession);
	if (Number.isFinite(sessionNumeric)) return sessionNumeric;

	if (req && req.cookies && req.cookies.userInfo) {
		try {
			const parsedCookie = typeof req.cookies.userInfo === 'string'
				? JSON.parse(decodeURIComponent(req.cookies.userInfo))
				: req.cookies.userInfo;
			if (parsedCookie) {
				const tipoKeys = ['Tipo_Usu_ID'];
				for (const key of tipoKeys) {
					if (Object.prototype.hasOwnProperty.call(parsedCookie, key)) {
						const cookieNumeric = Number(parsedCookie[key]);
						if (Number.isFinite(cookieNumeric)) return cookieNumeric;
					}
				}
			}
		} catch (err) {
			console.warn('obtenerTipoUsuarioSesion: falló al analizar la cookie userInfo', err && err.message ? err.message : err);
		}
	}

	const userId = Number.isFinite(Number(userIdOverride)) ? Number(userIdOverride) : obtenerIdUsuarioSesion(req);
	if (!Number.isFinite(userId)) return null;

	try {
		const row = await recipesModel.obtenerTipoUsuarioPorId(userId);
		if (row && typeof row.Tipo_Usu_ID !== 'undefined' && row.Tipo_Usu_ID !== null) {
			const tipoNumeric = Number(row.Tipo_Usu_ID);
			if (req && req.session) {
				req.session.user = req.session.user || {};
				req.session.user.Tipo_Usu_ID = tipoNumeric;
			}
			return Number.isFinite(tipoNumeric) ? tipoNumeric : null;
		}
	} catch (err) {
		console.error('Error al obtener el Tipo_Usu_ID del usuario:', err && err.message ? err.message : err);
	}

	return null;
};

const analizarIdParamReceta = (req, res) => {
	const recipeId = Number.parseInt(req.params.id, 10);
	if (!Number.isFinite(recipeId) || recipeId <= 0) {
		res.status(400).json({ error: 'id_receta_invalido' });
		return null;
	}
	return recipeId;
};

const dividirTerminosBusqueda = (raw) => {
	if (!raw || typeof raw !== 'string') return [];
	return raw
		.split(/[,+]/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.slice(0, 8);
};

const normalizarRutaActivo = (raw, fallback = '') => {
	const toWebPath = (value) => {
		if (!value) return '';
		const str = String(value).trim();
		if (!str) return '';
		if (/^https?:\/\//i.test(str) || str.startsWith('data:')) return str;
		return `/${str.replace(/^\/+/, '').replace(/\\/g, '/')}`;
	};

	const candidate = toWebPath(raw);
	if (candidate) return candidate;
	const fallbackCandidate = toWebPath(fallback);
	return fallbackCandidate || '';
};

const minutosATiempo = (totalMinutes) => {
	const safeMinutes = Number.isFinite(totalMinutes) && totalMinutes > 0 ? Math.floor(totalMinutes) : 0;
	const hours = Math.floor(safeMinutes / 60);
	const minutes = safeMinutes % 60;
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
};

const analizarCargaTiempoPreparacion = (payload) => {
	if (!payload || typeof payload !== 'object') return '00:30:00';
	const hours = Number(payload.hours);
	const minutes = Number(payload.minutes);
	const normalizedHours = Number.isFinite(hours) && hours > 0 ? hours : 0;
	const normalizedMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
	const totalMinutes = normalizedHours * 60 + normalizedMinutes;
	return minutosATiempo(totalMinutes > 0 ? totalMinutes : 30);
};

const buildPayloadError = (message, statusCode = 400) => {
	const err = new Error(message || 'datos_invalidos');
	err.statusCode = statusCode;
	err.isPayloadError = true;
	return err;
};

const normalizarRecetaPayload = async ({ req, body, userId }) => {
	const {
		name,
		description,
		categoryId,
		difficulty,
		prepTime,
		portions,
		recipeTypeId,
		steps,
		ingredients,
		utensils,
		image,
		images,
	} = body || {};

	const title = typeof name === 'string' ? name.trim() : '';
	if (!title || title.length < 3 || title.length > 255) {
		throw buildPayloadError(errorMessages.nombre_invalido);
	}
	if (profanityFilter.containsProfanity(title)) {
		throw buildPayloadError(errorMessages.nombre_contiene_palabras_inapropiadas);
	}

	const catId = Number(categoryId);
	if (!Number.isFinite(catId) || catId <= 0) {
		throw buildPayloadError(errorMessages.categoria_invalida);
	}

	const difficultyNum = Number(difficulty);
	if (!Number.isFinite(difficultyNum) || difficultyNum < 1 || difficultyNum > 10) {
		throw buildPayloadError(errorMessages.dificultad_invalida);
	}

	const portionsNumRaw = Number(portions);
	const portionsNum = Number.isFinite(portionsNumRaw) ? Math.round(portionsNumRaw) : Number.NaN;
	if (!Number.isFinite(portionsNum) || portionsNum < 1 || portionsNum > 50) {
		throw buildPayloadError(errorMessages.porciones_invalidas);
	}

	const normalizedSteps = Array.isArray(steps)
		? steps
			.map((step) => (typeof step === 'string' ? step.trim() : ''))
			.filter((step) => step.length > 0)
		: [];
	if (!normalizedSteps.length) {
		throw buildPayloadError(errorMessages.pasos_invalidos);
	}
	if (normalizedSteps.some((step) => profanityFilter.containsProfanity(step))) {
		throw buildPayloadError(errorMessages.pasos_contienen_lenguaje_inapropiado);
	}

	const instructions = normalizedSteps
		.map((step, index) => `${index + 1}. ${step}`)
		.join('\n');

	const utensilsList = Array.isArray(utensils)
		? utensils
			.map((item) => {
				if (typeof item !== 'string') return '';
				return item.trim().slice(0, 100);
			})
			.filter((item) => item.length > 0)
		: [];

	const normalizedUtensils = [];
	const seenUtensils = new Set();
	for (const utensilName of utensilsList) {
		const key = utensilName.toLowerCase();
		if (seenUtensils.has(key)) continue;
		seenUtensils.add(key);
		normalizedUtensils.push(utensilName);
	}

	if (normalizedUtensils.length > 20) {
		normalizedUtensils.length = 20;
	}
	if (normalizedUtensils.some((item) => profanityFilter.containsProfanity(item))) {
		throw buildPayloadError(errorMessages.utensilios_contienen_palabras_inapropiadas);
	}

	const descriptionText = typeof description === 'string' ? description.trim() : '';

	if (!descriptionText || descriptionText.length < 10) {
		throw buildPayloadError(errorMessages.descripcion_invalida);
	}
	if (profanityFilter.containsProfanity(descriptionText)) {
		throw buildPayloadError(errorMessages.descripcion_contiene_palabras_inapropiadas);
	}

	const prepTimeValue = analizarCargaTiempoPreparacion(prepTime);

	const userTipo = await obtenerTipoUsuarioSesion(req, userId);
	const requestedTypeId = Number(recipeTypeId);
	const resolvedRecipeType = Number.isFinite(requestedTypeId) && requestedTypeId > 0 ? requestedTypeId : 1;
	const finalRecipeType = userTipo === 1 || (Number.isFinite(userTipo) && userTipo >= 3)
		? resolvedRecipeType
		: 1;

	const normalizedIngredients = Array.isArray(ingredients)
		? ingredients
			.map((ingredient) => {
				if (!ingredient || typeof ingredient !== 'object') return null;
				const rawName = typeof ingredient.name === 'string' ? ingredient.name.trim() : '';
				const nameValue = rawName.slice(0, 50);
				if (!nameValue) return null;
				const quantityValueRaw = typeof ingredient.quantity === 'string'
					? ingredient.quantity.trim()
					: String(ingredient.quantity || '');
				const unitValueRaw = typeof ingredient.unit === 'string' ? ingredient.unit.trim() : '';
				const quantityValue = quantityValueRaw.slice(0, 50);
				const unitValue = unitValueRaw.slice(0, 50);
				return {
					name: nameValue,
					quantity: quantityValue,
					unit: unitValue,
				};
			})
			.filter(Boolean)
		: [];

	if (!normalizedIngredients.length) {
		throw buildPayloadError(errorMessages.ingredientes_invalidos);
	}
	const ingredientsContainProfanity = normalizedIngredients.some((ingredient) => {
		if (profanityFilter.containsProfanity(ingredient.name)) return true;
		if (ingredient.quantity && profanityFilter.containsProfanity(ingredient.quantity)) return true;
		if (ingredient.unit && profanityFilter.containsProfanity(ingredient.unit)) return true;
		return false;
	});
	if (ingredientsContainProfanity) {
		throw buildPayloadError(errorMessages.ingredientes_contienen_palabras_inapropiadas);
	}

	let imagePayloadList = [];
	if (Array.isArray(images) && images.length) {
		imagePayloadList = images;
	} else if (image && typeof image === 'object') {
		imagePayloadList = [image];
	}

	const imageDataUrls = imagePayloadList
		.map((item) => {
			if (!item || typeof item !== 'object') return '';
			const raw = typeof item.dataUrl === 'string' ? item.dataUrl.trim() : '';
			return raw;
		})
		.filter((value) => value && value.length > 0);

	if (!imageDataUrls.length && imagePayloadList.length) {
		throw buildPayloadError(errorMessages.formato_de_imagen_invalido);
	}

	if (imageDataUrls.length > MAX_IMAGES_PER_RECIPE) {
		throw buildPayloadError(errorMessages.demasiadas_imagenes);
	}

	if (imageDataUrls.some((dataUrl) => !dataUrl.startsWith('data:image/'))) {
		throw buildPayloadError(errorMessages.formato_de_imagen_invalido);
	}

	return {
		title,
		descriptionText,
		catId,
		difficultyNum,
		portionsNum,
		instructions,
		normalizedUtensils,
		normalizedIngredients,
		imageDataUrls,
		prepTimeValue,
		finalRecipeType,
	};
};

const convertirInstruccionesALista = (rawInstructions) => {
	if (!rawInstructions || typeof rawInstructions !== 'string') return [];
	return rawInstructions
		.split(/\r?\n+/)
		.map((line) => line.replace(/^\s*\d+\.?\s*/, '').trim())
		.filter((line) => line.length > 0);
};

const descomponerTiempoPreparacion = (value) => {
	if (!value || typeof value !== 'string') {
		return { hours: 0, minutes: 0 };
	}
	const parts = value.split(':');
	const hours = Number.parseInt(parts[0], 10);
	const minutes = Number.parseInt(parts[1], 10);
	return {
		hours: Number.isFinite(hours) && hours > 0 ? hours : 0,
		minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 0,
	};
};

const cleanupRecipeImageFiles = async (relativePaths = []) => {
	if (!Array.isArray(relativePaths) || !relativePaths.length) return;
	const uniquePaths = Array.from(new Set(
		relativePaths
			.map((raw) => (typeof raw === 'string' ? raw.trim() : ''))
			.filter(Boolean)
	));
	await Promise.allSettled(
		uniquePaths.map(async (relativePath) => {
			const normalizedPath = relativePath.replace(/\\/g, '/');
			const fileName = path.posix.basename(normalizedPath);
			if (fileName.startsWith('0.')) return;
			const sanitized = normalizedPath.replace(/^[/\\]+/, '');
			const absolutePath = path.join(__dirname, '..', sanitized);
			try {
				await fsp.unlink(absolutePath);
			} catch (err) {
				if (err && err.code !== 'ENOENT') {
					console.warn('No se pudo eliminar la imagen antigua:', absolutePath, err.message || err);
				}
			}
		})
	);
};

let reportesColumnSchemaCache = null;
const obtenerEsquemaColumnasReportes = async () => {
	if (reportesColumnSchemaCache) return reportesColumnSchemaCache;
	try {
		const poolConfig = recipesModel.obtenerConfiguracionPool();
		const dbName = (poolConfig && poolConfig.database) || process.env.DB_NAME || 'recetas';
		const rows = await recipesModel.obtenerColumnasReportes(dbName);
		const names = new Set((rows || []).map((row) => row.columnName));
		reportesColumnSchemaCache = {
			columns: names,
			hasLegacy: names.has('rep_tipo') && names.has('rep_id_obj'),
			hasNew: names.has('rep_tipo_obj') && names.has('rep_obj_id'),
		};
	} catch (err) {
		console.warn('No se pudo obtener el esquema de la tabla reportes:', err && err.message ? err.message : err);
		reportesColumnSchemaCache = {
			columns: new Set(['rep_tipo', 'rep_id_obj', 'rep_fecha']),
			hasLegacy: true,
			hasNew: false,
		};
	}
	return reportesColumnSchemaCache;
};

const renderizarDetalleReceta = async (req, res) => {
	const id = Number.parseInt(req.params.id, 10);
	if (Number.isNaN(id)) {
		return res.redirect('/error');
	}
	try {
		const recipe = await recipesModel.obtenerDetalleRecetaPublicaPorId(id);
		if (!recipe) {
			return res.redirect('/error');
		}
		const ingredients = await recipesModel.obtenerIngredientesDetalladosPorReceta(id);
		const utensilsRows = await recipesModel.obtenerUtensiliosDetalladosPorReceta(id);
		const utensils = Array.isArray(utensilsRows)
			? utensilsRows
				.map((row) => {
					const numericId = Number(row.id);
					const nameValue = typeof row.name === 'string' ? row.name.trim() : '';
					return {
						id: numericId,
						name: nameValue,
					};
				})
				.filter((row) => Number.isFinite(row.id) && row.name)
			: [];

		const filePath = path.join(__dirname, '..', 'views', 'recipe-detail.html');
		let html = await fsp.readFile(filePath, 'utf8');
		const dataScript = `\n<script>window.RECIPE = ${JSON.stringify(recipe)}; window.RECIPE_INGREDIENTS = ${JSON.stringify(ingredients)}; window.RECIPE_UTENSILS = ${JSON.stringify(utensils)};</script>\n`;
		if (html.includes('</body>')) html = html.replace('</body>', dataScript + '</body>');
		else html += dataScript;

		return res.send(html);
	} catch (err) {
		console.error('Error al cargar la receta:', err);
		return res.status(500).sendFile(path.join(__dirname, '..', 'views', 'Error.html'));
	}
};

const obtenerComentariosReceta = async (req, res) => {
	const recipeId = analizarIdParamReceta(req, res);
	if (!recipeId) return;
	try {
		const comments = await recipesModel.obtenerComentariosPorReceta(recipeId);
		return res.json({ comments });
	} catch (err) {
		console.error('Error en GET /api/recetas/:id/comentarios:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'No se pudieron cargar los comentarios' });
	}
};

const obtenerRecetasRelacionadas = async (req, res) => {
	const recipeId = analizarIdParamReceta(req, res);
	if (!recipeId) return;

	const RECOMMENDED_LIMIT = 6;
	const DEFAULT_IMAGE = 'Imagenes/Recetas/1.png';

	try {
		const baseRecipe = await recipesModel.obtenerRecetaBasicaPorId(recipeId);

		if (!baseRecipe) {
			return res.status(404).json({ error: 'Receta no encontrada' });
		}

		const seen = new Set([recipeId]);
		const related = [];

		const appendRows = (rows = []) => {
			for (const row of rows) {
				const id = Number(row.Rec_ID);
				if (!Number.isFinite(id) || seen.has(id)) continue;

				related.push({
					id,
					name: row.Rec_Nombre || '',
					image: normalizarRutaActivo(row.primaryImage, DEFAULT_IMAGE),
					time: row.Rec_Tiempo_Prep,
					difficulty: row.Rec_Dificultad,
					portions: row.Rec_Porcion != null ? Number(row.Rec_Porcion) : null,
					premium: Number(row.Tipo_Rec_ID) === 2,
					category: row.Cat_Nombre || '',
					categoryId: Number(row.Cat_ID) || null,
					authorId: Number(row.Usu_ID) || null,
					authorName: row.Autor_Nombre || '',
					authorAlias: row.Autor_Alias || '',
					avgRating: row.avgRating != null ? Number(row.avgRating) : null,
					ratingsCount: row.ratingsCount != null ? Number(row.ratingsCount) : 0,
					publishedAt: row.Rec_Fecha_Publicacion || null,
				});

				seen.add(id);
				if (related.length >= RECOMMENDED_LIMIT) break;
			}
		};

		const baseCategory = Number(baseRecipe.Cat_ID);
		const baseAuthor = Number(baseRecipe.Usu_ID);

		if (related.length < RECOMMENDED_LIMIT && Number.isFinite(baseCategory) && baseCategory > 0) {
			const rows = await recipesModel.obtenerRecetasRelacionadasPorCategoria({ recipeId, categoryId: baseCategory });
			appendRows(rows);
		}

		if (related.length < RECOMMENDED_LIMIT && Number.isFinite(baseAuthor) && baseAuthor > 0) {
			const rows = await recipesModel.obtenerRecetasRelacionadasPorAutor({ recipeId, authorId: baseAuthor });
			appendRows(rows);
		}

		if (related.length < RECOMMENDED_LIMIT) {
			const rows = await recipesModel.obtenerRecetasRecientesParaRecomendaciones({ recipeId });
			appendRows(rows);
		}

		return res.json({ related });
	} catch (err) {
		console.error('Error en GET /api/recetas/:id/relacionadas:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'No se pudieron cargar las recetas relacionadas' });
	}
};

const publicarComentarioReceta = async (req, res) => {
	const recipeId = analizarIdParamReceta(req, res);
	if (!recipeId) return;
	const userId = requerirIdUsuarioSesion(req, res);
	if (!userId) return;

	const text = req.body && typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
	if (!text) return res.status(400).json({ error: 'comentario requerido' });
	if (text.length > 255) return res.status(400).json({ error: 'comentario demasiado largo' });
	if (profanityFilter.containsProfanity(text)) {
		return res.status(400).json({ error: 'comentario contiene profanidad' });
	}

	try {
		const insertResult = await recipesModel.guardarComentarioReceta({ userId, recipeId, comment: text });
		const commentId = insertResult && Number.isFinite(insertResult.insertId) ? Number(insertResult.insertId) : null;
		const comment = commentId ? await recipesModel.obtenerComentarioPorId(commentId) : null;
		return res.json({ success: true, comment });
	} catch (err) {
		console.error('Error en POST /api/recetas/:id/comentarios:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'no se pudo guardar el comentario' });
	}
};

const eliminarComentarioReceta = async (req, res) => {
	const recipeId = analizarIdParamReceta(req, res);
	if (!recipeId) return;

	const commentId = Number.parseInt(req.params.comentarioId, 10);
	if (!Number.isFinite(commentId) || commentId <= 0) {
		return res.status(400).json({ error: 'id de comentario invalido' });
	}

	const userId = requerirIdUsuarioSesion(req, res);
	if (!userId) return;

	let userTipo = await obtenerTipoUsuarioSesion(req, userId);
	if (!Number.isFinite(userTipo)) userTipo = null;

	try {
		const row = await recipesModel.obtenerPropietarioComentario({ commentId, recipeId });

		if (!row) {
			return res.status(404).json({ error: 'comentario no encontrado' });
		}

		const ownerId = Number(row.Usu_ID);
		if (userTipo !== 1 && ownerId !== userId) {
			return res.status(403).json({ error: 'prohibido' });
		}

		await recipesModel.eliminarComentarioPorIds({ commentId, recipeId });

		return res.json({ success: true, deletedId: commentId });
	} catch (err) {
		console.error('Error en DELETE /api/recetas/:id/comentarios/:comentarioId:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'no se pudo eliminar el comentario' });
	}
};

const crearReporte = async (req, res) => {
	const userId = requerirIdUsuarioSesion(req, res);
	if (!userId) return;

	const rawType = req.body && req.body.type ? String(req.body.type).trim().toLowerCase() : '';
	const allowedTypes = new Set(['receta', 'comentario', 'usuario']);
	if (!allowedTypes.has(rawType)) {
		return res.status(400).json({ error: 'tipo invalido' });
	}

	const targetId = Number.parseInt(req.body && req.body.targetId, 10);
	if (!Number.isFinite(targetId) || targetId <= 0) {
		return res.status(400).json({ error: 'id de objetivo invalido' });
	}

	const motivoRaw = req.body && typeof req.body.motivo === 'string' ? req.body.motivo.trim() : '';
	if (!motivoRaw) {
		return res.status(400).json({ error: 'motivo requerido' });
	}
	if (motivoRaw.length < 10) {
		return res.status(400).json({ error: 'motivo demasiado corto' });
	}
	if (profanityFilter.containsProfanity(motivoRaw)) {
		return res.status(400).json({ error: 'motivo contiene profanidad' });
	}

	const motivo = motivoRaw.length > 255 ? motivoRaw.slice(0, 255) : motivoRaw;

	try {
		const reportesSchema = await obtenerEsquemaColumnasReportes();
		const tipoColumn = reportesSchema.columns && reportesSchema.columns.has('rep_tipo_obj') && !reportesSchema.columns.has('rep_tipo') ? 'Rep_Tipo_Obj' : 'Rep_Tipo';
		const objetoColumn = reportesSchema.columns && reportesSchema.columns.has('rep_obj_id') && !reportesSchema.columns.has('rep_id_obj') ? 'Rep_Obj_ID' : 'Rep_ID_Obj';
		const existing = await recipesModel.buscarReporteExistente({
			userId,
			tipoColumn,
			objetoColumn,
			type: rawType,
			targetId,
		});
		if (existing && existing.Rep_ID) {
			return res.json({ status: 'duplicate', reportId: existing.Rep_ID });
		}

		let relatedRecipeId = null;
		if (rawType === 'receta') {
			const exists = await recipesModel.existeReceta(targetId);
			if (!exists) {
				return res.status(404).json({ error: 'objetivo no encontrado' });
			}
			relatedRecipeId = targetId;
		} else if (rawType === 'comentario') {
			const commentRow = await recipesModel.obtenerRecetaParaComentario(targetId);
			if (!commentRow) {
				return res.status(404).json({ error: 'objetivo no encontrado' });
			}
			relatedRecipeId = commentRow.Rec_ID || null;
		} else if (rawType === 'usuario') {
			const exists = await recipesModel.existeUsuario(targetId);
			if (!exists) {
				return res.status(404).json({ error: 'objetivo no encontrado' });
			}
		}

		const result = await recipesModel.insertarReporte({
			userId,
			tipoColumn,
			objetoColumn,
			type: rawType,
			targetId,
			motivo,
			estado: 'pendiente',
		});

		return res.json({
			status: 'created',
			reportId: result && result.insertId ? result.insertId : null,
			redirectRecipeId: relatedRecipeId,
		});
	} catch (err) {
		console.error('Error en POST /api/reportes:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'no se pudo crear el reporte' });
	}
};

const obtenerResumenReceta = async (req, res) => {
	const recipeId = analizarIdParamReceta(req, res);
	if (!recipeId) return;
	const userId = obtenerIdUsuarioSesion(req);
	try {
		const ratingSummary = await recipesModel.obtenerResumenCalificacionesReceta(recipeId);

		let userRating = null;
		let isFavorite = false;
		let userTipo = null;
		if (userId) {
			userRating = await recipesModel.obtenerCalificacionDeUsuario({ recipeId, userId });

			const favoriteRow = await recipesModel.esRecetaFavorita({ recipeId, userId });
			isFavorite = Boolean(favoriteRow);

			userTipo = await obtenerTipoUsuarioSesion(req, userId);
		}

		return res.json({
			avgRating: ratingSummary.avgRating,
			totalRatings: ratingSummary.totalRatings,
			userRating,
			isFavorite,
			loggedIn: Boolean(userId),
			userTipo: Number.isFinite(userTipo) ? Number(userTipo) : null,
		});
	} catch (err) {
		console.error('Error en GET /api/recetas/:id/resumen:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'No se pudo cargar el resumen.' });
	}
};

const calificarReceta = async (req, res) => {
	const recipeId = analizarIdParamReceta(req, res);
	if (!recipeId) return;
	const userId = requerirIdUsuarioSesion(req, res);
	if (!userId) return;

	const score = Number(req.body && req.body.score);
	if (!Number.isInteger(score) || score < 1 || score > 10) {
		return res.status(400).json({ error: 'puntuacion invalida' });
	}

	try {
		await recipesModel.guardarCalificacion({ recipeId, userId, score });

		const ratingRow = await recipesModel.obtenerResumenCalificacionesReceta(recipeId);

		return res.json({
			success: true,
			avgRating: ratingRow.avgRating,
			totalRatings: ratingRow.totalRatings,
			userRating: score,
		});
	} catch (err) {
		console.error('Error en POST /api/recetas/:id/calificacion:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'no se pudo guardar la puntuacion' });
	}
};

const marcarFavoritaReceta = async (req, res) => {
	const recipeId = analizarIdParamReceta(req, res);
	if (!recipeId) return;
	const userId = requerirIdUsuarioSesion(req, res);
	if (!userId) return;

	try {
		const existing = await recipesModel.esRecetaFavorita({ recipeId, userId });

		if (existing) {
			return res.json({ success: true, isFavorite: true });
		}

		const favId = await recipesModel.obtenerSiguienteFavoritoId();

		await recipesModel.insertarFavorito({ favId, userId, recipeId });

		return res.json({ success: true, isFavorite: true });
	} catch (err) {
		console.error('Error en POST /api/recetas/:id/favorita:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'no se pudo guardar el favorito' });
	}
};

const quitarFavoritaReceta = async (req, res) => {
	const recipeId = analizarIdParamReceta(req, res);
	if (!recipeId) return;
	const userId = requerirIdUsuarioSesion(req, res);
	if (!userId) return;

	try {
		await recipesModel.eliminarFavorito({ recipeId, userId });
		return res.json({ success: true, isFavorite: false });
	} catch (err) {
		console.error('Error en DELETE /api/recetas/:id/favorita:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'no se pudo eliminar el favorito' });
	}
};

const buscarRecetas = async (req, res) => {
	try {
		const { q = '', ingredients = '', category = '', difficulty = '', maxTime } = req.query || {};
		if ((q && profanityFilter.containsProfanity(q)) || (ingredients && profanityFilter.containsProfanity(ingredients))) {
			return res.status(400).json({ error: 'consulta contiene palabras inapropiadas' });
		}
		if (typeof category === 'string' && category && !Number.isFinite(Number(category)) && profanityFilter.containsProfanity(category)) {
			return res.status(400).json({ error: 'consulta contiene palabras inapropiadas' });
		}
		if (typeof difficulty === 'string' && difficulty && profanityFilter.containsProfanity(difficulty)) {
			return res.status(400).json({ error: 'consulta contiene palabras inapropiadas' });
		}
		const terms = dividirTerminosBusqueda([q, ingredients].filter(Boolean).join(','));
		const maxMinutes = Number(maxTime);
		const rows = await recipesModel.buscarRecetas({
			terms,
			category,
			difficulty,
			maxMinutes: Number.isFinite(maxMinutes) && maxMinutes > 0 ? maxMinutes : null,
		});
		return res.json(Array.isArray(rows) ? rows : []);
	} catch (err) {
		console.error('Error en GET /api/recetas/buscar:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'no se pudo buscar recetas' });
	}
};

const obtenerOpcionesReceta = async (req, res) => {
	const userId = obtenerIdUsuarioSesion(req);
	let userTipo = null;

	if (Number.isFinite(Number(userId))) {
		try {
			userTipo = await obtenerTipoUsuarioSesion(req, userId);
		} catch (tipoErr) {
			console.warn('GET /api/recetas/opciones: no se pudo resolver el tipo de usuario', tipoErr && tipoErr.message ? tipoErr.message : tipoErr);
		}
	}

	try {
		const [categoryRows, typeRows, ingredientRows, utensilRows] = await Promise.all([
			recipesModel.obtenerCatalogoCategorias(),
			recipesModel.obtenerCatalogoTiposReceta(),
			recipesModel.obtenerCatalogoIngredientes(),
			recipesModel.obtenerCatalogoUtensilios(),
		]);

		return res.json({
			categories: (categoryRows || []).map((row) => ({ id: Number(row.id), name: typeof row.name === 'string' ? row.name.trim() : row.name })),
			recipeTypes: (typeRows || []).map((row) => ({ id: Number(row.id), name: typeof row.name === 'string' ? row.name.trim() : row.name })),
			ingredients: (ingredientRows || []).map((row) => ({ id: Number(row.id), name: typeof row.name === 'string' ? row.name.trim() : row.name })),
			utensils: (utensilRows || []).map((row) => ({ id: Number(row.id), name: typeof row.name === 'string' ? row.name.trim() : row.name })),
			userTipo: Number.isFinite(Number(userTipo)) ? Number(userTipo) : null,
		});
	} catch (err) {
		console.error('Error en GET /api/recetas/opciones:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'no se pudo cargar las opciones' });
	}
};

const crearReceta = async (req, res) => {
	const userId = requerirIdUsuarioSesion(req, res);
	if (!userId) return;

	let normalizedPayload;
	try {
		normalizedPayload = await normalizarRecetaPayload({ req, body: req.body, userId });
	} catch (err) {
		if (err && err.isPayloadError) {
			return res.status(err.statusCode || 400).json({ error: err.message || errorMessages.fallo_al_crear_la_receta });
		}
		console.error('Error al validar datos de la receta:', err && err.message ? err.message : err);
		return res.status(500).json({ error: errorMessages.fallo_al_crear_la_receta });
	}

	const {
		title,
		descriptionText,
		catId,
		difficultyNum,
		portionsNum,
		instructions,
		normalizedUtensils,
		normalizedIngredients,
		imageDataUrls,
		prepTimeValue,
		finalRecipeType,
	} = normalizedPayload;

	let recipeId = null;
	const storedImagePaths = [];
	const savedFilePaths = [];

	const connection = await recipesModel.obtenerConexion();
	try {
		await connection.beginTransaction();

		const categoryExists = await recipesModel.validarExistenciaCategoria(connection, catId);
		if (!categoryExists) {
			await connection.rollback();
			return res.status(400).json({ error: errorMessages.categoria_no_encontrada });
		}

		const typeExists = await recipesModel.validarExistenciaTipoReceta(connection, finalRecipeType);
		if (!typeExists) {
			await connection.rollback();
			return res.status(400).json({ error: errorMessages.tipo_de_receta_no_encontrado });
		}

				const nextRecipeId = await recipesModel.obtenerSiguienteRecetaId(connection);

				recipeId = await recipesModel.insertarReceta(connection, {
			categoryId: catId,
			userId,
			title,
			description: descriptionText,
			instructions,
			difficulty: difficultyNum,
			prepTime: prepTimeValue,
			portions: portionsNum,
			recipeTypeId: finalRecipeType,
					recipeId: nextRecipeId,
		});
		if (!recipeId) {
			throw new Error('Error al crear la receta');
		}

		for (const ingredient of normalizedIngredients) {
			let ingredientId = await recipesModel.buscarIngredienteIdPorNombre(connection, ingredient.name);
			if (!ingredientId) {
				const nextId = await recipesModel.obtenerSiguienteIngredienteIdConConexion(connection);
				await recipesModel.insertarIngredienteConConexion(connection, nextId, ingredient.name);
				ingredientId = nextId;
			}
			await recipesModel.guardarIngredienteReceta(connection, {
				recipeId,
				ingredientId,
				quantity: ingredient.quantity,
				unit: ingredient.unit,
			});
		}

		if (normalizedUtensils.length) {
			for (const utensilName of normalizedUtensils) {
				const utensilId = await recipesModel.insertarOUObtenerUtensilioId(connection, utensilName);
				if (!utensilId) continue;
				await recipesModel.vincularRecetaConUtensilio(connection, { recipeId, utensilId });
			}
		}

		if (imageDataUrls.length) {
			let nextImgId = await recipesModel.obtenerSiguienteImagenRecetaId(connection);

			for (let idx = 0; idx < imageDataUrls.length; idx += 1) {
				const relativePath = await saveRecipeImageFromDataUrl(imageDataUrls[idx], recipeId, idx);
				if (relativePath) {
					storedImagePaths.push(relativePath);
					const absolutePath = path.join(__dirname, '..', ...relativePath.split('/'));
					savedFilePaths.push(absolutePath);
					await recipesModel.insertarImagenReceta(connection, {
						imageId: nextImgId,
						recipeId,
						relativePath,
					});
					nextImgId += 1;
				}
			}
		}

		await connection.commit();
	} catch (err) {
		await connection.rollback();
		if (savedFilePaths.length) {
			await Promise.allSettled(
				savedFilePaths.map(async (filePath) => {
					try {
						await fsp.unlink(filePath);
					} catch (cleanupErr) {
						if (cleanupErr && cleanupErr.code !== 'ENOENT') {
							console.warn('No se pudo eliminar la imagen guardada tras un error:', cleanupErr && cleanupErr.message ? cleanupErr.message : cleanupErr);
						}
					}
				})
			);
		}
		if (err && err.message === 'image_too_large') {
			return res.status(400).json({ error: errorMessages.imagen_demasiado_grande });
		}
		if (err && err.message === 'image_path_too_long') {
			return res.status(500).json({ error: errorMessages.ruta_de_imagen_demasiado_larga });
		}
		if (err && err.message === 'too_many_images') {
			return res.status(400).json({ error: errorMessages.demasiadas_imagenes });
		}
		console.error('Error en POST /api/recetas:', err && err.message ? err.message : err);
		return res.status(500).json({ error: errorMessages.fallo_al_crear_la_receta });
	} finally {
		connection.release();
	}

	const imagePathsResponse = storedImagePaths.map((relativePath) => {
		const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
		return normalized.replace(/\\/g, '/');
	});

	return res.status(201).json({
		success: true,
		recipeId,
		imagePaths: imagePathsResponse,
		imagePath: imagePathsResponse.length ? imagePathsResponse[0] : null,
	});
};

const renderizarListaRecetas = async (req, res) => {
	try {
		const [rows, categoryRows] = await Promise.all([
			recipesModel.obtenerRecetasConMetadatos(),
			recipesModel.obtenerCatalogoCategorias(),
		]);

		const userId = obtenerIdUsuarioSesion(req);
		const userTipo = await obtenerTipoUsuarioSesion(req, userId);
		const numericTipo = Number(userTipo);

		let favoriteRecipeIds = [];
		if (Number.isFinite(userId)) {
			try {
				const favoriteRows = await recipesModel.obtenerIdsRecetasFavoritasUsuario(userId);
				favoriteRecipeIds = Array.isArray(favoriteRows) ? favoriteRows.map((row) => row.Rec_ID) : [];
			} catch (favoriteErr) {
				console.warn('ruta de recetas: no se pudieron cargar los favoritos para el usuario', userId, favoriteErr && favoriteErr.message ? favoriteErr.message : favoriteErr);
			}
		}

		let currentUserPayload = null;
		const cookieRaw = req.cookies && req.cookies.userInfo;
		if (cookieRaw) {
			try {
				const parsedCookie = typeof cookieRaw === 'string' ? JSON.parse(decodeURIComponent(cookieRaw)) : cookieRaw;
				if (parsedCookie && typeof parsedCookie === 'object') {
					currentUserPayload = { ...parsedCookie };
				}
			} catch (cookieErr) {
				console.warn('ruta de recetas: no se pudo analizar la cookie userInfo', cookieErr && cookieErr.message ? cookieErr.message : cookieErr);
			}
		}

		if (!currentUserPayload && (Number.isFinite(userId) || Number.isFinite(numericTipo))) {
			currentUserPayload = {};
		}

		if (currentUserPayload) {
			if (Number.isFinite(userId) && currentUserPayload.id == null) currentUserPayload.id = userId;
			if (req.session && req.session.user && req.session.user.nombre && !currentUserPayload.nombre) {
				currentUserPayload.nombre = req.session.user.nombre;
			}
			if (Number.isFinite(numericTipo)) {
				currentUserPayload.Tipo_Usu_ID = numericTipo;
				currentUserPayload.tipoUsuId = numericTipo;
				currentUserPayload.tipoId = numericTipo;
			}
		}

		const normalizedCategories = Array.isArray(categoryRows)
			? categoryRows.map((row) => ({
				id: Number(row.id),
				name: typeof row.name === 'string' ? row.name.trim() : row.name,
			}))
			: [];

		const filePath = path.join(__dirname, '..', 'views', 'recipes.html');
		let html = await fsp.readFile(filePath, 'utf8');
		const dataScript = `\n<script>window.RECIPES = ${JSON.stringify(rows)}; window.CURRENT_USER = ${JSON.stringify(currentUserPayload)}; window.FAVORITE_RECIPES = ${JSON.stringify(favoriteRecipeIds)}; window.RECIPE_CATEGORIES = ${JSON.stringify(normalizedCategories)};</script>\n`;
		html = html.replace('<script>', dataScript + '<script>');

		res.send(html);
	} catch (err) {
		console.error('Error al cargar las recetas desde la base de datos:', err);
		return res.sendFile(path.join(__dirname, '..', 'views', 'recipes.html'));
	}
};

const obtenerRecetasGuardadas = async (req, res) => {
	const userId = requerirIdUsuarioSesion(req, res);
	if (!userId) return;

	const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim() : '';
	const rawCategory = typeof req.query.category === 'string' ? req.query.category.trim() : '';
	const sortKey = typeof req.query.sort === 'string' ? req.query.sort.trim().toLowerCase() : 'recent';

	const categoryId = Number.parseInt(rawCategory, 10);

	try {
		const rows = await recipesModel.obtenerRecetasFavoritasPorUsuario({
			userId,
			search: rawSearch,
			categoryId: Number.isFinite(categoryId) ? categoryId : null,
			sortKey,
		});

		const recipes = (rows || []).map((row) => {
			const premium = Number(row.recipeTypeId) === 2;
			return {
				id: Number(row.recipeId),
				name: row.name || '',
				description: row.description || '',
				prepTime: row.prepTime || null,
				difficulty: row.difficulty != null ? Number(row.difficulty) : null,
				savedAt: row.savedAt ? new Date(row.savedAt).toISOString() : null,
				categoryId: row.categoryId != null ? Number(row.categoryId) : null,
				categoryName: row.categoryName || '',
				typeId: row.recipeTypeId != null ? Number(row.recipeTypeId) : null,
				typeName: row.recipeTypeName || '',
				premium,
				author: {
					id: row.authorId != null ? Number(row.authorId) : null,
					name: row.authorName || '',
					photo: normalizarRutaActivo(row.authorPhoto, '/Imagenes/Usuarios/0.png'),
				},
				imageUrl: normalizarRutaActivo(row.imagePath, '/Imagenes/Recetas/1.png'),
				avgRating: row.avgRating != null ? Number(row.avgRating) : null,
				totalRatings: row.totalRatings != null ? Number(row.totalRatings) : 0,
			};
		});

		const total = recipes.length;
		const premiumCount = recipes.filter((recipe) => recipe.premium).length;
		const freeCount = total - premiumCount;

		const categoryRows = await recipesModel.obtenerCategoriasFavoritas();

		res.setHeader('Cache-Control', 'no-store');
		return res.json({
			recipes,
			stats: {
				total,
				premium: premiumCount,
				free: freeCount,
			},
			categories: (categoryRows || []).map((cat) => ({
				id: Number(cat.id),
				name: cat.name || '',
			})),
		});
	} catch (err) {
		console.error('Error en GET /api/yo/recetas-guardadas:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'fallo_al_cargar_recetas_guardadas' });
	}
};

const obtenerRecetasPropias = async (req, res) => {
	const userId = requerirIdUsuarioSesion(req, res);
	if (!userId) return;

	const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim() : '';
	const rawCategory = typeof req.query.category === 'string' ? req.query.category.trim() : '';
	const sortKey = typeof req.query.sort === 'string' ? req.query.sort.trim().toLowerCase() : 'recent';
	const categoryId = Number.parseInt(rawCategory, 10);

	try {
		const rows = await recipesModel.obtenerRecetasPropiasPorUsuario({
			userId,
			search: rawSearch,
			categoryId: Number.isFinite(categoryId) ? categoryId : null,
			sortKey,
		});

		const recipes = (rows || []).map((row) => ({
			id: Number(row.recipeId),
			name: row.name || '',
			description: row.description || '',
			publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
			prepTime: row.prepTime || null,
			difficulty: row.difficulty != null ? Number(row.difficulty) : null,
			portions: row.portions != null ? Number(row.portions) : null,
			categoryId: row.categoryId != null ? Number(row.categoryId) : null,
			categoryName: row.categoryName || '',
			typeId: row.recipeTypeId != null ? Number(row.recipeTypeId) : null,
			typeName: row.recipeTypeName || '',
			imageUrl: normalizarRutaActivo(row.imagePath, '/Imagenes/Recetas/1.png'),
			avgRating: row.avgRating != null ? Number(row.avgRating) : null,
			totalRatings: row.totalRatings != null ? Number(row.totalRatings) : 0,
			totalFavorites: row.totalFavorites != null ? Number(row.totalFavorites) : 0,
		}));

		const now = new Date();
		const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
		const publishedThisMonth = recipes.filter((recipe) => recipe.publishedAt && recipe.publishedAt.startsWith(monthKey)).length;
		const recentCount = recipes.filter((recipe) => {
			if (!recipe.publishedAt) return false;
			const publishedDate = new Date(recipe.publishedAt);
			return Number.isFinite(publishedDate.getTime()) && (now - publishedDate) / (1000 * 60 * 60 * 24) <= 30;
		}).length;
		const favoritesTotal = recipes.reduce((acc, recipe) => acc + (Number(recipe.totalFavorites) || 0), 0);

		const categories = await recipesModel.obtenerCategorias();

		return res.json({
			recipes,
			stats: {
				total: recipes.length,
				publishedThisMonth,
				recent: recentCount,
				totalFavorites: favoritesTotal,
			},
			categories: (categories || []).map((cat) => ({
				id: Number(cat.id || cat.Cat_ID || 0) || null,
				name: cat.nombre || cat.Cat_Nombre || '',
			})).filter((cat) => cat && Number.isFinite(cat.id) && cat.name),
		});
	} catch (err) {
		console.error('Error en GET /api/yo/mis-recetas:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'fallo_al_cargar_mis_recetas' });
	}
};

const obtenerRecetaPropiaDetalle = async (req, res) => {
	const userId = requerirIdUsuarioSesion(req, res);
	if (!userId) return;

	const recipeId = analizarIdParamReceta(req, res);
	if (!recipeId) return;

	try {
		const receta = await recipesModel.obtenerRecetaEditablePorUsuario({ recipeId, userId });
		if (!receta) {
			return res.status(404).json({ error: 'receta_no_encontrada' });
		}

		const [ingredientsRows, utensilRows, imageRows] = await Promise.all([
			recipesModel.obtenerIngredientesPorReceta(recipeId),
			recipesModel.obtenerUtensiliosPorReceta(recipeId),
			recipesModel.obtenerImagenesRecetaOrdenadas(recipeId),
		]);

		const prepTime = descomponerTiempoPreparacion(receta.Rec_Tiempo_Prep);
		const steps = convertirInstruccionesALista(receta.Rec_Instrucciones);

		return res.json({
			recipe: {
				id: recipeId,
				name: receta.Rec_Nombre || '',
				description: receta.Rec_Descripcion || '',
				difficulty: receta.Rec_Dificultad != null ? Number(receta.Rec_Dificultad) : 1,
				portions: receta.Rec_Porcion != null ? Number(receta.Rec_Porcion) : 1,
				categoryId: receta.Cat_ID != null ? Number(receta.Cat_ID) : null,
				recipeTypeId: receta.Tipo_Rec_ID != null ? Number(receta.Tipo_Rec_ID) : 1,
				prepTime,
			},
			steps,
			ingredients: (ingredientsRows || []).map((row) => ({
				name: row.name || row.Ing_Nombre || '',
				quantity: row.quantity || row.RI_Cantidad || '',
				unit: row.unit || row.RI_Unidad || '',
			})),
			utensils: (utensilRows || [])
				.map((row) => row.name || row.Ute_Nombre || '')
				.filter((value) => value && value.length > 0),
			images: (imageRows || []).map((row) => normalizarRutaActivo(row.Img_Rutas, '/Imagenes/Recetas/1.png')),
		});
	} catch (err) {
		console.error('Error en GET /api/yo/mis-recetas/:id:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'no_se_pudo_cargar_la_receta' });
	}
};

const actualizarRecetaPropia = async (req, res) => {
	const userId = requerirIdUsuarioSesion(req, res);
	if (!userId) return;

	const recipeId = analizarIdParamReceta(req, res);
	if (!recipeId) return;

	let normalizedPayload;
	try {
		normalizedPayload = await normalizarRecetaPayload({ req, body: req.body, userId });
	} catch (err) {
		if (err && err.isPayloadError) {
			return res.status(err.statusCode || 400).json({ error: err.message || 'datos_invalidos' });
		}
		console.error('Error al validar datos para actualizar receta:', err && err.message ? err.message : err);
		return res.status(500).json({ error: errorMessages.fallo_al_crear_la_receta });
	}

	const {
		title,
		descriptionText,
		catId,
		difficultyNum,
		portionsNum,
		instructions,
		normalizedUtensils,
		normalizedIngredients,
		imageDataUrls,
		prepTimeValue,
		finalRecipeType,
	} = normalizedPayload;

	const oldImageRows = await recipesModel.obtenerImagenesRecetaOrdenadas(recipeId).catch(() => []);
	const oldImagePaths = (oldImageRows || []).map((row) => row.Img_Rutas || '').filter(Boolean);
	let storedImagePaths = [];
	if (!imageDataUrls.length) {
		storedImagePaths = oldImagePaths.slice();
	}

	const savedFilePaths = [];
	const connection = await recipesModel.obtenerConexion();
	try {
		await connection.beginTransaction();

		const receta = await recipesModel.obtenerRecetaEditablePorUsuario({ recipeId, userId });
		if (!receta) {
			await connection.rollback();
			return res.status(404).json({ error: 'receta_no_encontrada' });
		}

		const categoryExists = await recipesModel.validarExistenciaCategoria(connection, catId);
		if (!categoryExists) {
			await connection.rollback();
			return res.status(400).json({ error: errorMessages.categoria_no_encontrada });
		}

		const typeExists = await recipesModel.validarExistenciaTipoReceta(connection, finalRecipeType);
		if (!typeExists) {
			await connection.rollback();
			return res.status(400).json({ error: errorMessages.tipo_de_receta_no_encontrado });
		}

		await recipesModel.actualizarRecetaPorId(
			recipeId,
			[
				'Rec_Nombre = ?',
				'Rec_Descripcion = ?',
				'Rec_Instrucciones = ?',
				'Rec_Dificultad = ?',
				'Rec_Tiempo_Prep = ?',
				'Rec_Porcion = ?',
				'Tipo_Rec_ID = ?',
				'Cat_ID = ?',
			],
			[
				title,
				descriptionText,
				instructions,
				difficultyNum,
				prepTimeValue,
				portionsNum,
				finalRecipeType,
				catId,
			],
			connection,
		);

		await recipesModel.eliminarIngredientesReceta(connection, recipeId);
		await recipesModel.eliminarUtensiliosReceta(connection, recipeId);
		if (imageDataUrls.length) {
			await recipesModel.eliminarImagenesReceta(connection, recipeId);
		}

		for (const ingredient of normalizedIngredients) {
			let ingredientId = await recipesModel.buscarIngredienteIdPorNombre(connection, ingredient.name);
			if (!ingredientId) {
				const nextId = await recipesModel.obtenerSiguienteIngredienteIdConConexion(connection);
				await recipesModel.insertarIngredienteConConexion(connection, nextId, ingredient.name);
				ingredientId = nextId;
			}
			await recipesModel.guardarIngredienteReceta(connection, {
				recipeId,
				ingredientId,
				quantity: ingredient.quantity,
				unit: ingredient.unit,
			});
		}

		if (normalizedUtensils.length) {
			for (const utensilName of normalizedUtensils) {
				const utensilId = await recipesModel.insertarOUObtenerUtensilioId(connection, utensilName);
				if (!utensilId) continue;
				await recipesModel.vincularRecetaConUtensilio(connection, { recipeId, utensilId });
			}
		}

		if (imageDataUrls.length) {
			let nextImgId = await recipesModel.obtenerSiguienteImagenRecetaId(connection);
			storedImagePaths = [];
			for (let idx = 0; idx < imageDataUrls.length; idx += 1) {
				const relativePath = await saveRecipeImageFromDataUrl(imageDataUrls[idx], recipeId, idx);
				if (relativePath) {
					storedImagePaths.push(relativePath);
					const absolutePath = path.join(__dirname, '..', ...relativePath.split('/'));
					savedFilePaths.push(absolutePath);
					await recipesModel.insertarImagenReceta(connection, {
						imageId: nextImgId,
						recipeId,
						relativePath,
					});
					nextImgId += 1;
				}
			}
		}

		await connection.commit();
	} catch (err) {
		await connection.rollback();
		if (savedFilePaths.length) {
			await Promise.allSettled(
				savedFilePaths.map(async (filePath) => {
					try {
						await fsp.unlink(filePath);
					} catch (cleanupErr) {
						if (cleanupErr && cleanupErr.code !== 'ENOENT') {
							console.warn('No se pudo eliminar la imagen tras fallo:', cleanupErr.message || cleanupErr);
						}
					}
				})
			);
		}
		if (err && err.message === 'image_too_large') {
			return res.status(400).json({ error: errorMessages.imagen_demasiado_grande });
		}
		if (err && err.message === 'image_path_too_long') {
			return res.status(500).json({ error: errorMessages.ruta_de_imagen_demasiado_larga });
		}
		if (err && err.message === 'too_many_images') {
			return res.status(400).json({ error: errorMessages.demasiadas_imagenes });
		}
		console.error('Error en PUT /api/yo/mis-recetas/:id:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'no_se_pudo_actualizar_la_receta' });
	} finally {
		connection.release();
	}

	if (imageDataUrls.length) {
		const pathsToDelete = oldImagePaths.filter((oldPath) => !storedImagePaths.includes(oldPath));
		if (pathsToDelete.length) {
			await cleanupRecipeImageFiles(pathsToDelete);
		}
	}

	const imagePathsResponse = (storedImagePaths || []).map((relativePath) => {
		const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
		return normalized.replace(/\\/g, '/');
	});

	return res.json({ success: true, recipeId, imagePaths: imagePathsResponse });
};

const eliminarRecetaPropia = async (req, res) => {
	const userId = requerirIdUsuarioSesion(req, res);
	if (!userId) return;

	const recipeId = analizarIdParamReceta(req, res);
	if (!recipeId) return;

	const imageRows = await recipesModel.obtenerImagenesRecetaOrdenadas(recipeId).catch(() => []);
	const imagePaths = (imageRows || []).map((row) => row.Img_Rutas || '').filter(Boolean);

	const connection = await recipesModel.obtenerConexion();
	try {
		await connection.beginTransaction();
		const receta = await recipesModel.obtenerRecetaEditablePorUsuario({ recipeId, userId });
		if (!receta) {
			await connection.rollback();
			return res.status(404).json({ error: 'receta_no_encontrada' });
		}

		await recipesModel.eliminarRelacionesReceta(connection, recipeId);
		await recipesModel.eliminarRecetaPorId(connection, recipeId);

		await connection.commit();
	} catch (err) {
		await connection.rollback();
		console.error('Error en DELETE /api/yo/mis-recetas/:id:', err && err.message ? err.message : err);
		return res.status(500).json({ error: 'no_se_pudo_eliminar_la_receta' });
	} finally {
		connection.release();
	}

	if (imagePaths.length) {
		await cleanupRecipeImageFiles(imagePaths);
	}

	return res.json({ success: true });
};

module.exports = {
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
};


