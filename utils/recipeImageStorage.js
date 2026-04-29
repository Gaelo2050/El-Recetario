/**
 * =============================================================
 *  Utilidad para almacenamiento de imágenes de recetas (recipeImageStorage.js)
 * =============================================================
 *  Descripción:
 *    - Gestiona el guardado y validación de imágenes asociadas a recetas.
 *    - Permite almacenar imágenes recibidas como DataURL en el sistema de archivos.
 *    - Controla el número máximo de imágenes por receta y el tamaño máximo permitido.
 *
 *  Funciones principales:
 *    - saveRecipeImageFromDataUrl(): Guarda una imagen de receta desde un DataURL
 *    - ensureUploadsDir(): Crea el directorio de imágenes si no existe
 *
 *  Dependencias:
 *    - path (gestión de rutas de archivos)
 *    - fs/promises (operaciones de archivos asíncronas)
 *
 *  Notas de seguridad:
 *    - Validación de formato, tamaño y cantidad de imágenes
 *    - Control de longitud de ruta y manejo de errores
 */
const path = require('path');
const fsp = require('fs').promises;

const MAX_IMAGES_PER_RECIPE = 5;
const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;
const EXTENSION_MAP = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp' };
const UPLOADS_DIR = path.join(__dirname, '..', 'Imagenes', 'Recetas');
const CATEGORY_UPLOADS_DIR = path.join(__dirname, '..', 'Imagenes', 'Categorias');
const CATEGORY_IMAGE_PREFIX = '';

const ensureUploadsDir = async () => {
  try {
    await fsp.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    if (err && err.code !== 'EEXIST') {
      throw err;
    }
  }
};

const ensureCategoryDir = async () => {
  try {
    await fsp.mkdir(CATEGORY_UPLOADS_DIR, { recursive: true });
  } catch (err) {
    if (err && err.code !== 'EEXIST') {
      throw err;
    }
  }
};

const saveRecipeImageFromDataUrl = async (dataUrl, recipeId, index = 0) => {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return null;
  }

  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!match) {
    return null;
  }

  const mimeExt = match[1].toLowerCase();
  const fileExt = EXTENSION_MAP[mimeExt] || 'png';
  const buffer = Buffer.from(match[2], 'base64');

  if (!buffer.length) {
    return null;
  }
  if (buffer.length > MAX_IMAGE_FILE_SIZE) {
    throw new Error('image_too_large');
  }

  const numericRecipeId = Number.parseInt(recipeId, 10);
  if (!Number.isFinite(numericRecipeId) || numericRecipeId <= 0) {
    throw new Error('invalid_recipe_id');
  }

  const numericIndex = Number.parseInt(index, 10);
  if (!Number.isFinite(numericIndex) || numericIndex < 0 || numericIndex >= MAX_IMAGES_PER_RECIPE) {
    throw new Error('too_many_images');
  }

  await ensureUploadsDir();

  const suffix = numericIndex === 0 ? '' : `.${numericIndex}`;
  const fileName = `${numericRecipeId}${suffix}.${fileExt}`;
  const relativePath = path.posix.join('Imagenes', 'Recetas', fileName);

  if (relativePath.length > 50) {
    throw new Error('image_path_too_long');
  }

  const absolutePath = path.join(UPLOADS_DIR, fileName);
  await fsp.writeFile(absolutePath, buffer);

  return relativePath;
};

const saveCategoryImageFromDataUrl = async (dataUrl, categoryId) => {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return null;
  }

  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!match) {
    return null;
  }

  const mimeExt = match[1].toLowerCase();
  const fileExt = EXTENSION_MAP[mimeExt] || 'png';
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    return null;
  }
  if (buffer.length > MAX_IMAGE_FILE_SIZE) {
    throw new Error('image_too_large');
  }

  const numericCategoryId = Number.parseInt(categoryId, 10);
  if (!Number.isFinite(numericCategoryId) || numericCategoryId <= 0) {
    throw new Error('invalid_category_id');
  }

  await ensureCategoryDir();
  const fileName = `${CATEGORY_IMAGE_PREFIX}${numericCategoryId}.${fileExt}`;
  const relativePath = path.posix.join('Imagenes', 'Categorias', fileName);
  const absolutePath = path.join(CATEGORY_UPLOADS_DIR, fileName);
  await fsp.writeFile(absolutePath, buffer);
  return `/${relativePath.replace(/\\/g, '/')}`;
};

const deleteCategoryImage = async (categoryId) => {
  const numericCategoryId = Number.parseInt(categoryId, 10);
  if (!Number.isFinite(numericCategoryId) || numericCategoryId <= 0) {
    return false;
  }
  await ensureCategoryDir();
  const pattern = new RegExp(`^${CATEGORY_IMAGE_PREFIX}${numericCategoryId}\\.(png|jpg|jpeg|webp)$`, 'i');
  const entries = await fsp.readdir(CATEGORY_UPLOADS_DIR);
  const matches = entries.filter((file) => pattern.test(file));
  await Promise.all(matches.map((file) => fsp.unlink(path.join(CATEGORY_UPLOADS_DIR, file)).catch(() => null)));
  return matches.length > 0;
};

module.exports = {
  saveRecipeImageFromDataUrl,
  saveCategoryImageFromDataUrl,
  deleteCategoryImage,
  MAX_IMAGES_PER_RECIPE,
  UPLOADS_DIR,
  MAX_IMAGE_FILE_SIZE,
  CATEGORY_UPLOADS_DIR,
};
