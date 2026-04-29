-- --------------------------------------------------------
-- Host:                         127.0.0.1
-- Versión del servidor:         12.0.2-MariaDB - mariadb.org binary distribution
-- SO del servidor:              Win64
-- HeidiSQL Versión:             12.11.0.7065
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Volcando estructura de base de datos para recetas
CREATE DATABASE IF NOT EXISTS `recetas` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci */;
USE `recetas`;

-- Volcando estructura para tabla recetas.alergias
CREATE TABLE IF NOT EXISTS `alergias` (
  `Ale_ID` int(11) NOT NULL ,
  `Ale_Nombre` varchar(50) NOT NULL,
  PRIMARY KEY (`Ale_ID`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.tipo_usuarios
CREATE TABLE IF NOT EXISTS `tipo_usuarios` (
  `Tipo_Usu_ID` int(11) NOT NULL,
  `Tipo_Nombre` varchar(50) NOT NULL,
  PRIMARY KEY (`Tipo_Usu_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.tipo_usuarios
CREATE TABLE IF NOT EXISTS `tipo_recetas` (
  `Tipo_Rec_ID` int(11) NOT NULL,
  `Tipo_Nombre` varchar(50) NOT NULL,
  PRIMARY KEY (`Tipo_Rec_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.usuarios
CREATE TABLE IF NOT EXISTS `usuarios` (
  `Usu_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Usu_Nombre` varchar(150) NOT NULL,
  `Usu_Alias` varchar(20) NOT NULL,
  `Usu_Cum` date NOT NULL,
  `Usu_Telefono` varchar(10) NOT NULL,
  `Usu_Email` varchar(100) NOT NULL,
  `Usu_Contraseña` varchar(255) NOT NULL,
  `Usu_Foto` varchar(255) NOT NULL,
  `Usu_Genero` char(1) NOT NULL,
  `Usu_Fecha_Registro` datetime NOT NULL DEFAULT current_timestamp(),
  `Usu_Biografia` varchar(255) NOT NULL DEFAULT 'No bio',
  `Usu_Verificado` bit(1) NOT NULL,
  `Usu_Activo` bit(1) NOT NULL,
  `Tipo_Usu_ID` int(11) NOT NULL,
  `Ale_ID` int(11) NOT NULL,
  PRIMARY KEY (`Usu_ID`),
  KEY `FK_usuarios_tipo` (`Tipo_Usu_ID`),
  KEY `FK_usuarios_alergias` (`Ale_ID`),
  CONSTRAINT `FK_usuarios_alergias` FOREIGN KEY (`Ale_ID`) REFERENCES `alergias` (`Ale_ID`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_usuarios_tipo` FOREIGN KEY (`Tipo_Usu_ID`) REFERENCES `tipo_usuarios` (`Tipo_Usu_ID`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `usuario_alergias` (
  `Usu_ID` INT(11) NOT NULL,
  `Ale_ID` INT(11) NOT NULL,
  PRIMARY KEY (`Usu_ID`, `Ale_ID`),
  CONSTRAINT `FK_usuario_alergias_usuarios` FOREIGN KEY (`Usu_ID`) REFERENCES `usuarios` (`Usu_ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_usuario_alergias_alergias` FOREIGN KEY (`Ale_ID`) REFERENCES `alergias` (`Ale_ID`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE IF NOT EXISTS `usuarios_retencion` (
  `Usu_ID` INT(11) NOT NULL,
  `condicion` ENUM('inactivo','no_verificado') NOT NULL,
  `fecha_inicio` DATETIME NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`Usu_ID`,`condicion`),
  CONSTRAINT `FK_retencion_usuarios` FOREIGN KEY (`Usu_ID`) REFERENCES `usuarios` (`Usu_ID`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.autenticacion
CREATE TABLE IF NOT EXISTS `autenticacion` (
  `Usu_ID` int(11) NOT NULL,
  `Auth_Service` varchar(255) DEFAULT NULL,
  `Auth_Username` varchar(50) DEFAULT NULL,
  `Auth_Token` varchar(255) DEFAULT NULL,
  `Auth_Secret` varchar(255) DEFAULT NULL,
  `Auth_Updated` datetime DEFAULT NULL,
  KEY `FK_autentificacion_usuarios` (`Usu_ID`),
  CONSTRAINT `FK_autentificacion_usuarios` FOREIGN KEY (`Usu_ID`) REFERENCES `usuarios` (`Usu_ID`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.logros
CREATE TABLE IF NOT EXISTS `logros` (
  `Logro_Id` int(11) NOT NULL,
  `Logro_Nombre` varchar(50) NOT NULL DEFAULT '',
  `Logro_Descripcion` varchar(255) NOT NULL DEFAULT '',
  `Logro_Nivel` enum('Básico','Medio','Avanzado') NOT NULL,
  `Logro_Puntos` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`Logro_Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.usuario_logros
CREATE TABLE IF NOT EXISTS `usuario_logros` (
  `Usu_ID` int(11) NOT NULL,
  `Logro_ID` int(11) NOT NULL,
  `Usu_Logro_Fecha_obtenido` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`Usu_ID`,`Logro_ID`) USING BTREE,
  CONSTRAINT `Fk_usuario_logros_usuarios` FOREIGN KEY (`Usu_ID`) REFERENCES `usuarios` (`Usu_ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Fk_usuario_logros_logros` FOREIGN KEY (`Logro_ID`) REFERENCES `logros` (`Logro_Id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.categorias
CREATE TABLE IF NOT EXISTS `categorias` (
  `Cat_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Cat_Nombre` varchar(255) NOT NULL,
  `Cat_Descripcion` text DEFAULT NULL,
  `Cat_Imagen` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`Cat_ID`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Volcando estructura para tabla recetas.ingredientes_tipo
CREATE TABLE IF NOT EXISTS `ingredientes_tipo` (
  `Ing_Tipo_ID` int(11) NOT NULL,
  `Ing_Tipo_Nombre` varchar(50) NOT NULL DEFAULT '',
  PRIMARY KEY (`Ing_Tipo_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.ingredientes
CREATE TABLE IF NOT EXISTS `ingredientes` (
  `Ing_ID` int(11) NOT NULL,
  `Ing_Tipo_ID` int(11) NOT NULL,
  `Ing_Nombre` varchar(50) NOT NULL DEFAULT '',
  PRIMARY KEY (`Ing_ID`),
  CONSTRAINT `FK_ingredientes_ingredientes_tipo` FOREIGN KEY (`Ing_Tipo_ID`) REFERENCES `ingredientes_tipo` (`Ing_Tipo_ID`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.recetas
CREATE TABLE IF NOT EXISTS `recetas` (
  `Rec_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Cat_ID` int(11) NOT NULL,
  `Usu_ID` int(11) NOT NULL,
  `Rec_Nombre` varchar(255) NOT NULL,
  `Rec_Descripcion` text NOT NULL,
  `Rec_Instrucciones` text NOT NULL,
  `Rec_Fecha_Publicacion` datetime NOT NULL DEFAULT current_timestamp(),
  `Rec_Dificultad` tinyint(11) NOT NULL,
  `Rec_Tiempo_Prep` time NOT NULL,
  `Rec_Porcion` int(11) NOT NULL,
  `Tipo_Rec_ID` int(11) NOT NULL,
  PRIMARY KEY (`Rec_ID`),
  CONSTRAINT `fk_recetas_categorias` FOREIGN KEY (`Cat_ID`) REFERENCES `categorias` (`Cat_ID`),
  CONSTRAINT `fk_recetas_usuarios` FOREIGN KEY (`Usu_ID`) REFERENCES `usuarios` (`Usu_ID`),
  CONSTRAINT `fk_recetas_tipo` FOREIGN KEY (`Tipo_Rec_ID`) REFERENCES `tipo_recetas` (`Tipo_Rec_ID`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Volcando estructura para tabla recetas.calificaciones
CREATE TABLE IF NOT EXISTS `calificaciones` (
  `Cal_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Rec_ID` int(11) NOT NULL,
  `Usu_ID` int(11) NOT NULL,
  `Cal_Puntuacion` int(11) NOT NULL CHECK (`Cal_Puntuacion` between 1 and 10),
  PRIMARY KEY (`Cal_ID`),
  UNIQUE KEY `Rec_ID` (`Rec_ID`,`Usu_ID`),
  CONSTRAINT `fk_calificaciones_recetas` FOREIGN KEY (`Rec_ID`) REFERENCES `recetas` (`Rec_ID`),
  CONSTRAINT `fk_calificaciones_usuarios` FOREIGN KEY (`Usu_ID`) REFERENCES `usuarios` (`Usu_ID`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Volcando estructura para tabla recetas.comentarios
CREATE TABLE IF NOT EXISTS `comentarios` (
  `Com_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Usu_ID` int(11) NOT NULL,
  `Rec_ID` int(11) NOT NULL,
  `Com_Comentario` varchar(255) NOT NULL,
  PRIMARY KEY (`Com_ID`),
  CONSTRAINT `FK_comentarios_recetas` FOREIGN KEY (`Rec_ID`) REFERENCES `recetas` (`Rec_ID`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_comentarios_usuarios` FOREIGN KEY (`Usu_ID`) REFERENCES `usuarios` (`Usu_ID`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.favoritos
CREATE TABLE IF NOT EXISTS `favoritos` (
  `Fav_ID` int(11) NOT NULL,
  `Usu_ID` int(11) NOT NULL,
  `Rec_ID` int(11) NOT NULL,
  `Fav_Fecha_Guardado` datetime NOT NULL,
  PRIMARY KEY (`Fav_ID`),
  CONSTRAINT `FK_favoritos_recetas` FOREIGN KEY (`Rec_ID`) REFERENCES `recetas` (`Rec_ID`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_favoritos_usuarios` FOREIGN KEY (`Usu_ID`) REFERENCES `usuarios` (`Usu_ID`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.receta_imagenes
CREATE TABLE IF NOT EXISTS `receta_imagenes` (
  `Img_ID` int(11) NOT NULL,
  `Rec_ID` int(11) NOT NULL,
  `Img_Rutas` varchar(50) NOT NULL,
  PRIMARY KEY (`Img_ID`),
  CONSTRAINT `FK_receta_imagenes_recetas` FOREIGN KEY (`Rec_ID`) REFERENCES `recetas` (`Rec_ID`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.receta_ingredientes
CREATE TABLE IF NOT EXISTS `receta_ingredientes` (
  `Rec_ID` int(11) NOT NULL,
  `Ing_ID` int(11) NOT NULL,
  `RI_Cantidad` varchar(50) NOT NULL DEFAULT '',
  `RI_Unidad` varchar(50) NOT NULL DEFAULT '',
  `RI_Notas` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`Rec_ID`,`Ing_ID`),
  CONSTRAINT `FK_receta_ingredientes_ingredientes` FOREIGN KEY (`Ing_ID`) REFERENCES `ingredientes` (`Ing_ID`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_receta_ingredientes_recetas` FOREIGN KEY (`Rec_ID`) REFERENCES `recetas` (`Rec_ID`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.reportes
CREATE TABLE IF NOT EXISTS `reportes` (
  `Rep_ID` int(11) NOT NULL AUTO_INCREMENT, 
  `Usu_ID` int(11) NOT NULL,                          
  `Rep_Tipo_Obj` varchar(20) NOT NULL,                
  `Rep_Obj_ID` int(11) NOT NULL,                      
  `Rep_Motivo` varchar(255) NOT NULL,                 
  `Rep_Fecha_Rea` datetime DEFAULT CURRENT_TIMESTAMP, 
  `Rep_Estado` varchar(20) DEFAULT 'pendiente',       
  PRIMARY KEY (`Rep_ID`),
  FOREIGN KEY (`Usu_ID`) REFERENCES `usuarios` (`Usu_ID`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.utensilios
CREATE TABLE IF NOT EXISTS `utensilios` (
  `Ute_ID` INT(11) NOT NULL AUTO_INCREMENT,
  `Ute_Nombre` NVARCHAR(100) UNIQUE NOT NULL,
  PRIMARY KEY (`Ute_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.recetas_utensilios
CREATE TABLE IF NOT EXISTS `recetas_utensilios` (
  `Rec_ID` INT(11) NOT NULL,
  `Ute_ID` INT(11) NOT NULL,
  FOREIGN KEY (`Rec_ID`) REFERENCES `recetas`(`Rec_ID`),
  FOREIGN KEY (`Ute_ID`) REFERENCES `utensilios`(`Ute_ID`),
  PRIMARY KEY (`Rec_ID`, `Ute_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Volcando estructura para tabla recetas.usuarios_seguidores
CREATE TABLE IF NOT EXISTS `usuarios_seguidores` (
    `Seguidor_ID` INT NOT NULL,
    `Seguido_ID` INT NOT NULL,
    `Fecha_Seguimiento` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`Seguidor_ID`, `Seguido_ID`),
    CONSTRAINT FK_Seguidores_Usuario_Seguidor FOREIGN KEY (`Seguidor_ID`)
        REFERENCES `usuarios` (`Usu_ID`) ON DELETE CASCADE,
    CONSTRAINT FK_Seguidores_Usuario_Seguido FOREIGN KEY (`Seguido_ID`)
        REFERENCES `usuarios` (`Usu_ID`) ON DELETE CASCADE,
    CONSTRAINT CHK_Seguidor_Seguid CHECK (`Seguidor_ID` <> `Seguido_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;


-- Volcando datos para la tabla recetas.alergias: ~11 rows (aproximadamente)
REPLACE INTO `alergias` (`Ale_ID`, `Ale_Nombre`) VALUES
	(1, 'leche'),
	(2, 'huevos'),
  (3, 'cacahuates'),
  (4, 'frutos secos'),
  (5, 'pescado'),
  (6, 'mariscos'),
  (7, 'soya'),
  (8, 'trigo / gluten'),
  (9, 'sésamo (ajonjolí)'),
  (10, 'frutas'),
  (11, 'legumbres');

-- Volcando datos para la tabla recetas.tipo_usuarios: ~3 rows (aproximadamente)
REPLACE INTO `tipo_usuarios` (`Tipo_Usu_ID`, `Tipo_Nombre`) VALUES
	(1, 'Administrador'),
	(2, 'No premium'),
	(3, 'Premium');

-- Volcando datos para la tabla recetas.tipo_recetas: ~2 rows (aproximadamente)
REPLACE INTO `tipo_recetas` (`Tipo_Rec_ID`, `Tipo_Nombre`) VALUES
	(1, 'No premium'),
  (2, 'Premium');

-- Volcando datos para la tabla recetas.usuarios: ~9 rows (aproximadamente)
REPLACE INTO `usuarios` (`Usu_ID`, `Usu_Nombre`, `Usu_Alias`, `Usu_Cum`, `Usu_Telefono`, `Usu_Email`, `Usu_Contraseña`, `Usu_Foto`, `Usu_Genero`, `Usu_Fecha_Registro`, `Usu_Biografia`, `Tipo_Usu_ID`, `Ale_ID`) VALUES
	(1, 'Juan Angel Pérez Castro', 'JuanPerez28', '0000-00-00', '1234567890', 'juan.perez@email.com', '$2b$10$xkH5.wXxOPk5cfCn6IaGOujR752csiyyUHOf6vmh.Muf1h0HodHnu', 'Imagenes/Usuarios/1.png', 'M', '2025-09-22 14:30:37', 'Apasionado por la cocina, explorando nuevos sabores y compartiendo recetas caseras con un toque creativo y delicioso en cada plato. ', 3, 1),
	(2, 'Ana Maria Garcia Lopez', 'AnaGar', '0000-00-00', '1234567890', 'ana.garcia@email.com', '$2b$10$76IT5sE5eug4z8ylp9YQU.GDqr4xf4M9DcZg/WGYNgBzPJJ6utE.2', 'Imagenes/Usuarios/2.jpg', 'F', '2025-09-22 14:34:29', 'No bio', 2, 1),
	(3, 'Carlos Lopez', 'Carlos', '0000-00-00', '1234567890', 'carlos.lopez@email.com', '$2b$10$b7gZ7COpBpPAMga0FLk/yeKwDKXK4DeS4yCPjBvN3VRdvlWGRzt8W', 'Imagenes/Usuarios/3.jpg', 'M', '2025-09-22 14:35:18', 'No bio', 2, 1),
	(4, 'María Sánchez  ', 'Maria', '0000-00-00', '1234567890', 'maria.sanchez@email.com', '$2b$10$BYKVrNa4W/5a7kOzQjKqM.msRO0PDX3MkVhDuFXd9VCiOiQbrTs0.', 'Imagenes/Usuarios/4.jpg', 'F', '2025-09-22 14:35:52', 'No bio', 2, 1),
	(5, 'Luis Rodriguez', 'LuisRodri', '0000-00-00', '1234567890', 'luis.rodriguez@email.com', '$2b$10$3W2dqhyXK8H6m/EXSOoSqeOv6z84/V1fQNcJN.Mf09SC2CfK/YjAy', 'Imagenes/Usuarios/5.jpg', 'M', '2025-09-22 14:36:28', 'No bio', 2, 1),
	(6, 'Ricardo Angel Cruz Hernandez', 'RichardRc', '2000-12-12', '1234567890', 'angelhernandez_tommy@outlook.com', '$2b$10$Bkhrl4bQEkn23.9FbZMgmuSamyT2EnXXjJ1C2bDqmx.vLz8YdNuXy', 'Imagenes/Usuarios/0.png', 'M', '2025-11-02 01:56:01', 'No bio', 2, 1),
	(7, 'test', 'etsttatd2', '1879-07-04', '1234567890', 'test.test@gmail.com', '$2b$10$geWq7KXGk3g3yPd2EpeX1OHXCl6W1/inoAX.ZKVduBXMG/CzPffDy', 'Imagenes/Usuarios/7.png', 'M', '2025-11-04 01:56:43', 'No bio', 2, 1),
	(8, 'Alejandro', 'Alejandro12', '2002-09-11', '6565464323', 'diegsldcsd@gmail.com', '$2b$10$47BKhwOkMK0OGwKLWYFR6OpJz3skN/1.HFRROcnQZZil5fh9vAzFC', 'Imagenes/Usuarios/8.png', 'M', '2025-11-12 15:13:11', 'No bio', 2, 1),
	(9, 'pitwadosaw', 'puaasda124', '1905-12-12', '1234567893', 'l20170642@culiacan.tecnm.mx', '$2b$10$ISYJ8r7dbMIunMxgTI9YfO1hJS8hJWN1cdfdEG5.PM0NwP/aR5poC', 'Imagenes/Usuarios/9.png', 'M', '2025-11-22 01:08:33', 'No bio', 2, 1);

-- Volcando datos para la tabla recetas.usuario_alergias: ~2 rows (aproximadamente)
REPLACE INTO `usuario_alergias` (`Usu_ID`, `Ale_ID`) VALUES
  (1, 1),
  (2, 3);

-- Volcando datos para la tabla recetas.logros: ~15 rows (aproximadamente)
REPLACE INTO `logros` (`Logro_Id`, `Logro_Nombre`, `Logro_Descripcion`, `Logro_Nivel`, `Logro_Puntos`) VALUES
	(1, 'Primer paso', 'Publica tu primera receta.', 'Básico', 10),
	(2, 'Chef principiante', 'Publica 5 recetas.', 'Básico', 20),
	(3, 'Cocinero constante', 'Publica 10 recetas.', 'Medio', 40),
	(4, 'Chef creativo', 'Publica una receta con más de 5 ingredientes.', 'Medio', 30),
	(5, 'Receta popular', 'Recibe 50 “me gusta” en una receta.', 'Medio', 50),
	(6, 'Estrella del mes', 'Tu receta es la más votada del mes.', 'Avanzado', 100),
	(7, 'Crítico gastronómico', 'Comenta en 10 recetas diferentes.', 'Básico', 20),
	(8, 'Catador experto', 'Comenta en 50 recetas.', 'Medio', 40),
	(9, 'Socializador', 'Sigue a 5 cocineros.', 'Básico', 10),
	(10, 'Influencer culinario', 'Tienes más de 100 seguidores.', 'Avanzado', 80),
	(11, 'Fotógrafo gourmet', 'Agrega foto a 10 de tus recetas.', 'Medio', 30),
	(12, 'Explorador de sabores', 'Guarda 20 recetas de otros usuarios.', 'Medio', 25),
	(13, 'Maestro repostero', 'Publica 3 recetas de postres.', 'Medio', 30),
	(14, 'Chef internacional', 'Publica recetas de 5 países diferentes.', 'Avanzado', 70),
	(15, 'Veterano', 'Cumple 1 año activo en la plataforma.', 'Avanzado', 100);

-- Volcando datos para la tabla recetas.usuario_logros: ~4 rows (aproximadamente)
REPLACE INTO `usuario_logros` (`Usu_ID`, `Logro_ID`, `Usu_Logro_Fecha_obtenido`) VALUES
	(1, 1, '2025-10-18 12:35:57'),
	(1, 2, '2025-10-18 12:35:57'),
	(2, 1, '2025-10-18 12:35:57'),
	(3, 3, '2025-10-18 12:35:57');

-- Volcando datos para la tabla recetas.categorias: ~10 rows (aproximadamente)
REPLACE INTO `categorias` (`Cat_ID`, `Cat_Nombre`, `Cat_Descripcion`, `Cat_Imagen`) VALUES
  (1, 'Entrantes', 'Botanas y aperitivos para abrir el apetito.', '/Imagenes/Categorias/1.jpg'),
  (2, 'Sopas y Caldos', 'Preparaciones calientes y reconfortantes.', '/Imagenes/Categorias/2.jpg'),
  (3, 'Ensaladas', 'Opciones frescas con vegetales y granos.', '/Imagenes/Categorias/3.jpg'),
  (4, 'Carnes', 'Recetas enfocadas en res, cerdo y ave.', '/Imagenes/Categorias/4.webp'),
  (5, 'Pescados y Mariscos', 'Sabores del mar en todas sus presentaciones.', '/Imagenes/Categorias/5.jpg'),
  (6, 'Pasta', 'Clásicos italianos y fusiones creativas.', '/Imagenes/Categorias/6.jpg'),
  (7, 'Postres', 'Dulces para compartir en cualquier ocasión.', '/Imagenes/Categorias/7.jpg'),
  (8, 'Bebidas', 'Jugos, cocteles y bebidas refrescantes.', '/Imagenes/Categorias/8.jpg'),
  (9, 'Panadería', 'Masas, panes y repostería artesanal.', '/Imagenes/Categorias/9.jpg'),
  (10, 'Vegano', 'Platillos basados en plantas llenos de sabor.', '/Imagenes/Categorias/10.jpg');

-- Volcando datos para la tabla recetas.ingredientes_tipo: ~4 rows (aproximadamente)
REPLACE INTO `ingredientes_tipo` (`Ing_Tipo_ID`, `Ing_Tipo_Nombre`) VALUES
(1, 'Vegetal'),
(2, 'Animal'),
(3, 'Cereal'),
(4, 'Lácteo');

-- Volcando datos para la tabla recetas.ingredientes: ~85 rows (aproximadamente)
REPLACE INTO `ingredientes` (`Ing_ID`, `Ing_Tipo_ID`, `Ing_Nombre`) VALUES
  (1, 3, 'Tortilla de maíz'),
  (2, 2, 'Carne de cerdo marinada'),
  (3, 1, 'Pasta de achiote'),
  (4, 1, 'Piña en cubos'),
  (5, 1, 'Cebolla blanca'),
  (6, 1, 'Cilantro fresco'),
  (7, 1, 'Lechuga romana'),
  (8, 2, 'Pechuga de pollo'),
  (9, 4, 'Queso parmesano'),
  (10, 3, 'Crutones de pan'),
  (11, 3, 'Spaghetti seco'),
  (12, 2, 'Carne molida de res'),
  (13, 1, 'Puré de tomate'),
  (14, 1, 'Zanahoria'),
  (15, 1, 'Diente de ajo'),
  (16, 1, 'Aguacate'),
  (17, 1, 'Tomate saladet'),
  (18, 1, 'Jugo de limón'),
  (19, 1, 'Chile serrano'),
  (20, 3, 'Harina de trigo'),
  (21, 4, 'Queso mozzarella'),
  (22, 1, 'Albahaca fresca'),
  (23, 3, 'Arroz bomba'),
  (24, 2, 'Muslo de pollo'),
  (25, 2, 'Camarón mediano'),
  (26, 1, 'Pimiento rojo'),
  (27, 1, 'Alga nori'),
  (28, 2, 'Filete de salmón'),
  (29, 1, 'Pepino'),
  (30, 3, 'Vinagre de arroz'),
  (31, 3, 'Lámina de lasaña'),
  (32, 4, 'Queso ricotta'),
  (33, 4, 'Leche entera'),
  (34, 4, 'Mantequilla'),
  (35, 1, 'Frijoles refritos'),
  (36, 4, 'Crema ácida'),
  (37, 4, 'Queso fresco'),
  (38, 3, 'Tostada de maíz'),
  (39, 2, 'Jamón de pavo'),
  (40, 1, 'Chocolate en polvo'),
  (41, 3, 'Azúcar'),
  (42, 1, 'Tomate verde'),
  (43, 3, 'Maíz pozolero'),
  (44, 1, 'Chile guajillo'),
  (45, 1, 'Orégano seco'),
  (46, 3, 'Harina de avena'),
  (47, 2, 'Huevo'),
  (48, 4, 'Leche condensada'),
  (49, 1, 'Canela molida'),
  (50, 2, 'Filete de pescado blanco'),
  (51, 3, 'Pan para hamburguesa'),
  (52, 4, 'Queso cheddar'),
  (53, 1, 'Elote en trozos'),
  (54, 1, 'Papa blanca'),
  (55, 1, 'Repollo'),
  (56, 1, 'Chocolate amargo'),
  (57, 2, 'Miel'),
  (58, 1, 'Garbanzos cocidos'),
  (59, 1, 'Chile chipotle'),
  (60, 3, 'Arroz blanco'),
  (61, 2, 'Chorizo'),
  (62, 2, 'Tocino'),
  (63, 1, 'Chile jalapeño'),
  (64, 1, 'Aceite vegetal'),
  (65, 1, 'Paprika'),
  (66, 3, 'Hojas de maíz'),
  (67, 2, 'Manteca de cerdo'),
  (68, 3, 'Totopos de maíz'),
  (69, 1, 'Cebolla morada'),
  (70, 3, 'Vinagre blanco'),
  (71, 1, 'Salsa de soya'),
  (72, 1, 'Jengibre fresco'),
  (73, 1, 'Naranja'),
  (74, 2, 'Bistec de res'),
  (75, 3, 'Bolillo'),
  (76, 4, 'Queso panela'),
  (77, 4, 'Leche evaporada'),
  (78, 1, 'Extracto de vainilla'),
  (79, 1, 'Té negro'),
  (80, 1, 'Flor de manzanilla'),
  (81, 4, 'Yogurt natural'),
  (82, 1, 'Manzana roja'),
  (83, 1, 'Plátano'),
  (84, 1, 'Papaya'),
  (85, 1, 'Fresa'),
  (86, 4, 'Queso Oaxaca'),
  (87, 2, 'Atún en agua'),
  (88, 3, 'Pan de caja'),
  (89, 2, 'Mojarra entera'),
  (90, 1, 'Cardamomo'),
  (91, 1, 'Clavo de olor'),
  (92, 1, 'Comino molido'),
  (93, 1, 'Hoja de laurel'),
  (94, 3, 'Pan molido'),
  (95, 3, 'Pasta corta'),
  (96, 3, 'Fideo delgado'),
  (97, 3, 'Maicena'),
  (98, 1, 'Hebras de azafrán'),
  (99, 1, 'Aceite de oliva'),
  (100, 3, 'Arroz para sushi'),
  (101, 2, 'Mayonesa'),
  (102, 3, 'Masa de maíz fresca'),
  (103, 1, 'Chile ancho seco'),
  (104, 1, 'Rábano'),
  (105, 1, 'Frijol pinto cocido'),
  (106, 2, 'Caldo de pollo');


-- Volcando datos para la tabla recetas.recetas: ~52 rows (aproximadamente)
REPLACE INTO `recetas` (`Rec_ID`, `Cat_ID`, `Usu_ID`, `Rec_Nombre`, `Rec_Descripcion`, `Rec_Instrucciones`, `Rec_Fecha_Publicacion`, `Rec_Dificultad`, `Rec_Tiempo_Prep`, `Rec_Porcion`, `Tipo_Rec_ID`) VALUES
	(1, 4, 1, 'Tacos al Pastor', 'Deliciosos tacos de cerdo marinados con achiote, especias y piña.', '1. Corta la carne de cerdo en láminas delgadas. 2. En un tazón mezcla achiote, jugo de piña, vinagre, sal, ajo, orégano y chile guajillo molido. 3. Agrega la carne y marina por al menos 4 horas (ideal: toda la noche). 4. Cocina la carne en plancha o sartén caliente hasta dorar ligeramente. 5. Pica cebolla y cilantro finamente. 6. Calienta las tortillas. 7. Sirve la carne sobre las tortillas y agrega piña, cebolla, cilantro y salsa al gusto.', '2025-12-02 12:00:00', 6, '02:00:00', 5, 2),
	(2, 3, 2, 'Ensalada César', 'Ensalada fresca con pollo, lechuga y aderezo de parmesano.', '1. Lava y desinfecta la lechuga romana; seca y corta en trozos grandes. 2. Cocina la pechuga de pollo a la parrilla con sal y pimienta; deja reposar y rebana. 3. En un tazón grande mezcla la lechuga. 4. En un mezcla el aderezo: mayonesa, limón, ajo picado, parmesano rallado, sal y pimienta. 5. Añade el aderezo sobre la lechuga, luego mézclala con mezcla bien. 6. Incorpora las tiras de pollo y un poco más de parmesano', '2024-11-28 12:15:00', 3, '00:39:59', 5, 1),
	(3, 1, 3, 'Spaghetti a la Bolognesa', 'Espaguetis con salsa de carne molida, tomate y hierbas italianas.', '1. Cocina el spaghetti según las instrucciones del paquete; escurre y reserva. 2. En una sartén profunda sofríe cebolla, ajo y zanahoria finamente picados. 3. Agrega la carne molida y cocina hasta que cambie de color. 4. Incorpora puré de tomate, tomates triturados, sal, pimienta, orégano y laurel. 5. Cocina a fuego bajo 20 a 30 minutos para concentrar el sabor. 6. Mezcla la pasta con la salsa o sirve la salsa encima. 7. Espolvorea parmesano antes de servir.', '2024-11-28 12:30:00', 7, '01:00:00', 5, 2),
	(4, 1, 4, 'Guacamole', 'Aguacate triturado con cebolla, tomate, y jugo de limón.', '1. Parte los aguacates y coloca la pulpa en un tazón. 2. Tritura suavemente con un tenedor hasta obtener una consistencia cremosa pero con trozos. 3. Agrega cebolla finamente picada, tomate en cubos pequeños y cilantro. 4. Exprime jugo de limón y mezcla. 5. Añade sal al gusto y ajusta acidez. 6. Refrigera 10 minutos antes de servir para potenciar sabor.', '2024-11-28 12:45:00', 2, '00:39:00', 1, 1),
	(5, 7, 5, 'Pizza Margarita', 'Pizza con tomate, mozzarella y albahaca fresca.', '1. Prepara la masa mezclando harina, agua, levadura, sal y aceite; deja reposar 1 hora. 2. Extiende la masa en una charola con un rodillo. 3. Distribuye salsa de tomate natural sobre la superficie. 4. Coloca rebanadas de mozzarella fresca. 5. Hornea a 250°C por 12-15 minutos o hasta dorar. 6. Al salir del horno agrega hojas de albahaca fresca.', '2024-11-28 13:00:00', 6, '01:29:00', 2, 1),
	(6, 3, 1, 'Paella Valenciana', 'Arroz con mariscos, pollo y verduras al estilo tradicional de Valencia.', '1. Calienta aceite en una sartén y sofríe los trozos de pollo y mariscos. 2. Agrega cebolla y pimiento picados; cocina 3 minutos. 3. Incorpora el tomate triturado y cocina hasta reducir. 4. Añade el arroz y remueve para impregnarlo del sofrito. 5. Vierte caldo caliente con azafrán, sal y pimienta. 6. Cocina sin mover por 20 minutos a fuego medio. 7. Reposa 5 minutos tapado antes de servir.', '2024-11-28 13:15:00', 8, '03:39:00', 5, 1),
	(7, 1, 2, 'Sopes', 'Masa de maíz con frijoles, carne y salsa.', '1. Mezcla la masa con agua tibia y sal hasta lograr consistencia suave. 2. Forma círculos gruesos y pellizca las orillas para crear borde. 3. Fríe en aceite caliente hasta dorar ligeramente. 4. Unta frijoles refritos en cada sope. 5. Agrega carne deshebrada o molida cocida. 6. Añade crema, lechuga, queso y salsa.', '2024-11-28 13:30:00', 5, '01:29:00', 1, 1),
	(8, 5, 3, 'Sushi', 'Arroz con vinagre, pescado crudo y algas.', '1. Lava el arroz 3 veces hasta que el agua salga clara; cocina y deja entibiar. 2. Mezcla el arroz con vinagre de arroz, azúcar y sal. 3. Coloca una hoja de nori sobre la esterilla. 4. Extiende una capa fina de arroz sin aplastar. 5. Añade tiras de pescado fresco y vegetales. 6. Enrolla firmemente con la esterilla. 7. Corta en piezas con un cuchillo húmedo.', '2024-11-28 13:45:00', 10, '02:00:00', 2, 1),
	(9, 3, 4, 'Lasagna', 'Pastel de capas con carne, pasta y salsa bechamel.', '1. Cocina láminas de pasta y reserva. 2. Prepara la salsa de carne con tomate, cebolla, ajo y especias. 3. Haz la salsa bechamel derritiendo mantequilla, agregando harina y luego leche. 4. En un refractario coloca: salsa de carne, pasta, bechamel y queso. 5. Repite capas hasta llenar. 6. Hornea 30 minutos a 180°C. 7. Deja reposar 10 minutos antes de cortar.', '2024-11-28 14:00:00', 8, '01:30:00', 2, 1),
	(10, 1, 5, 'Tostadas de Pollo', 'Tortilla frita cubierta con pollo, crema y lechuga.', '1. Fríe las tortillas en aceite caliente hasta que queden crujientes. 2. Cocina el pollo en agua con sal y ajo; desmenuza. 3. Unta una capa fina de frijoles en la tostada. 4. Coloca el pollo encima. 5. Añade crema, lechuga, queso y salsa. 6. Sirve inmediatamente para conservar la textura.', '2024-11-28 14:15:00', 4, '00:20:00', 1, 1),
	(11, 4, 1, 'Tacos de Jamón', 'Fina lonche de jamón de pavo abrazado de tortilla de maíz.', '1 .Saca el jamón del refri. 2. Calienta las tortillas. 3. Coloca el jamón en las tortillas. 4. Dóblalas y disfruta tus tacos de jamón.', '2025-11-06 01:37:33', 1, '00:15:00', 2, 1),
	(12, 8, 6, 'ChocoMilk', 'Una bebida clásica que combina la suavidad de la leche con el sabor intenso del chocolate. Este Chocomilk casero es perfecto para comenzar el día con energía o disfrutarlo como un antojo dulce a cualquier hora. Su preparación es rápida y sencilla, ideal para quienes buscan un toque de nostalgia y sabor en cada sorbo.', '1. Vierte la leche en un vaso o licuadora.\n2. Agrega el chocolate en polvo.\n3. Mezcla bien con una cuchara o licúa durante unos segundos hasta que no queden grumos.\n4. Sirve inmediatamente.', '2025-11-12 23:31:32', 1, '00:10:00', 2, 1),
	(13, 1, 3, 'Chilaquiles Verdes', 'Tortillas fritas bañadas en salsa verde con pollo y crema.', '1. Corta las tortillas en triángulos y fríelas hasta que estén crujientes. 2. Licúa tomate verde, chile serrano, ajo y cebolla. 3. Cocina la salsa en una olla con un poco de aceite. 4. Agrega las tortillas fritas a la salsa y mezcla suavemente. 5. Sirve con crema, queso fresco y cebolla. 6. Opcional: agrega pollo desmenuzado.\n', '2024-11-29 09:00:00', 3, '00:20:00', 2, 1),
	(14, 7, 4, 'Hamburguesa Clásica', 'Carne jugosa con queso, lechuga, jitomate y pan suave.', '1. Forma medallones de carne y sazónalos. 2. Asa la carne hasta el término deseado y derrite el queso encima. 3. Arma la hamburguesa con pan, lechuga, jitomate y cebolla. 4. Agrega aderezos al gusto.\n', '2024-11-29 09:15:00', 4, '00:25:00', 1, 2),
	(15, 2, 5, 'Pozole Rojo', 'Caldo tradicional con maíz, cerdo y chile.', '1. Cuece carne de cerdo con ajo y cebolla. 2. Hidrata chiles guajillo y ancho, licúa y cuela. 3. Agrega el chile al caldo junto con el maíz pozolero. 4. Cocina 40–60 minutos. 5. Sirve con lechuga, cebolla, rábanos, orégano y limón.', '2024-11-29 09:30:00', 6, '01:30:00', 6, 1),
	(16, 7, 1, 'Pancakes', 'Esponjosos y dulces para el desayuno.', '1. Mezcla harina, huevo, leche, azúcar y mantequilla derretida.2. Cocina porciones en un sartén caliente hasta que aparezcan burbujas. 3. Voltea y cocina el otro lado. 4. Sirve con miel o fruta.\' ', '2024-11-29 09:45:00', 2, '00:18:00', 3, 1),
	(17, 4, 2, 'Pollo a la Naranja', 'Pollo crujiente con salsa cítrica.', '1. Fríe el pollo en trozos hasta dorar. 2. Mezcla jugo de naranja, soya, azúcar y jengibre. 3. Cocina la salsa hasta espesar. 4. Agrega el pollo y mezcla bien. 5. Sirve con arroz.', '2024-11-29 10:00:00', 5, '00:40:00', 4, 2),
	(18, 2, 3, 'Caldo de Res', 'Sopa tradicional con verduras y carne.', '1. Cuece la carne con hueso junto con ajo y cebolla. 2. Agrega elote, zanahoria y papa. 3. Incorpora calabaza y repollo al final. 4. Sirve con limón y cilantro.\'', '2024-11-29 10:15:00', 4, '01:10:00', 5, 1),
	(19, 7, 4, 'Brownies', 'Chocolate intenso y textura suave.', '1. Mezcla mantequilla derretida con azúcar y huevos. 2. Agrega harina, cocoa y sal. 3. Hornea 30–35 minutos a 180°C. 4. Enfría y corta en cuadros.\'', '2024-11-29 10:30:00', 3, '00:35:00', 8, 1),
	(20, 5, 5, 'Ceviche de Pescado', 'Pescado marinado en limón con verduras frescas.', '1. Corta el pescado en cubos pequeños. 2. Cúbrelo con limón 25–30 minutos. 3. Mezcla con jitomate, cebolla, pepino y cilantro. 4. Sirve frío.', '2024-11-29 10:45:00', 3, '01:00:00', 4, 1),
	(21, 1, 1, 'Quesadillas', 'Tortilla rellena de queso fundido.', '1. Coloca queso dentro de la tortilla. 2. Calienta en comal hasta que funda. 3. Dobla y sirve con salsa.', '2024-11-29 11:00:00', 1, '00:10:00', 1, 1),
	(22, 7, 2, 'Hot Cakes de Avena', 'Versión saludable con avena molida.', '1. Muele la avena hasta hacer harina. 2. Mezcla con huevo y leche. 3. Cocina en sartén caliente. 4. Sirve con miel o fruta.\'', '2024-11-29 11:15:00', 2, '00:20:00', 3, 1),
	(23, 1, 3, 'Enchiladas Rojas', 'Tortillas rellenas bañadas en salsa roja.', '1. Licúa chiles anchos hidratados con ajo. 2. Cocina la salsa para sazonar. 3. Rellena tortillas con pollo y bañarla. 4. Añade crema, queso y cebolla.', '2024-11-29 11:30:00', 4, '00:25:00', 4, 1),
	(24, 2, 4, 'Caldo Tlalpeño', 'Sopa picosita con pollo y chipotle.', '1. Cuece pollo con cebolla y ajo. 2. Agrega garbanzo, zanahoria y papa. 3. Incorpora chipotle y elote. 4. Sirve con limón y aguacate.', '2024-11-29 11:45:00', 3, '00:50:00', 4, 1),
	(25, 7, 5, 'Arroz con Leche', 'Postre cremoso y dulce con canela.', '1. Cocina el arroz con agua y canela. 2. Agrega leche y azúcar. 3. Cocina a fuego bajo hasta espesar.', '2024-11-29 12:00:00', 2, '00:45:00', 6, 1),
	(26, 4, 1, 'Frijoles Charros', 'Frijoles con chorizo, tocino y chile.', '1. Cuece los frijoles remojados. 2. Sofríe chorizo, tocino, cebolla y chile. 3. Mezcla todo y cocina 20 minutos.', '2024-11-29 12:15:00', 3, '01:00:00', 5, 1),
	(27, 7, 2, 'Papas Gajo', 'Papa sazonadas y crujientes.', '1. Corta papas en gajos. 2. Mezcla con aceite y especias. 3. Hornea 30–35 minutos a 200°C.\'', '2024-11-29 12:30:00', 2, '00:35:00', 3, 2),
	(28, 7, 3, 'Crepas', 'Delgadas y suaves, perfectas para postre.', '1. En un bowl, mezclar harina, leche, huevo, mantequilla derretida y una pizca de sal hasta obtener una mezcla muy líquida y sin grumos. 2. Calentar un sartén antiadherente, agregar una capa muy delgada de mezcla y mover el sartén para cubrir toda la superficie. 3. Cocinar 40–50 segundos por lado hasta dorar ligeramente. Repetir hasta terminar.', '2024-11-29 12:45:00', 3, '00:25:00', 4, 1),
	(29, 4, 4, 'Birria', 'Platillo tradicional de res o chivo con especias.', '1. Licuar chiles, ajo, cebolla, comino, clavo, orégano y vinagre para formar el adobo. 2. Bañar la carne con el adobo, tapar y dejar marinar mínimo 3 horas. 3. Cocinar a fuego lento (olla común u olla de presión) hasta que la carne esté muy suave y se deshebre fácilmente. 4. Corregir sazón y servir con cebolla, limón y tortillas.', '2024-11-29 13:00:00', 7, '02:30:00', 6, 1),
	(30, 1, 5, 'Tamal Verde', 'Relleno de pollo con salsa verde.', '1. Mezclar manteca, masa de maíz, caldo de pollo y sal hasta obtener una masa esponjosa. 2. Cocer tomate, chile y cebolla y licuar para obtener la salsa verde; mezclar con pollo desmenuzado. 3. Extender masa sobre hojas de maíz hidratadas, agregar relleno y cerrar. 4. Colocar en vaporera y cocinar 1 hora 50 minutos o hasta que la masa se desprenda de la hoja.', '2024-11-29 13:15:00', 4, '01:50:00', 3, 1),
	(31, 1, 1, 'Nachos', 'Totopos con carne, queso y jalapeño.', '1. Cocinar carne molida con cebolla, ajo y especias (sal, pimienta y comino). 2. En un plato, colocar totopos y cubrir con queso rallado y la carne preparada. 3. Calentar en microondas o sartén para derretir el queso. 4. Agregar jalapeños, crema y pico de gallo al gusto.', '2024-11-29 13:30:00', 2, '00:15:00', 2, 2),
	(32, 9, 2, 'Pan Francés', 'Pan dorado con huevo y canela.', '1. Batir huevo, leche, canela y vainilla en un plato hondo. 2. Remojar ligeramente las rebanadas de pan por ambos lados. 3. Cocinar a fuego medio en un sartén con mantequilla hasta dorar por ambos lados. 4. Servir con miel, azúcar glas o fruta.', '2024-11-29 13:45:00', 2, '00:20:00', 2, 1),
	(33, 5, 3, 'Atún a la Mexicana', 'Atún con tomate, cebolla y chile.', '1. Picar tomate, cebolla y chile serrano en cubos pequeños. 2. Sofreír la cebolla, agregar tomate y chile, cocinar 3 minutos. 3. Añadir el atún escurrido, mezclar y sazonar con sal y pimienta. 4. Cocinar a fuego bajo 5 minutos', '2024-11-29 14:00:00', 1, '00:18:00', 2, 1),
	(34, 4, 4, 'Milanesa de Res', 'Carne empanizada y dorada.', '1. Sazonar filetes de res con sal y pimienta. 2. Pasar la carne por harina, luego por huevo batido y finalmente por pan molido. 3. Freír en aceite caliente hasta que estén bien doradas por ambos lados. 4. Escurrir en papel absorbente y servir.', '2024-11-29 14:15:00', 3, '00:30:00', 3, 1),
	(35, 1, 5, 'Pico de Gallo', 'Salsa fresca con jitomate y cebolla.', '1. Picar jitomate, cebolla, cilantro y chile serrano en cubos finos. 2. Mezclar todo en un bowl, agregar jugo de limón, sal y pimienta. 3. Refrigerar 10 minutos para intensificar sabores.\'', '2024-11-29 14:30:00', 1, '00:10:00', 6, 1),
	(36, 1, 1, 'Macarrones con Queso', 'Pasta cremosa con queso cheddar.', '1. Cocer macarrones en agua con sal hasta que estén al dente. 2. En una olla, derretir mantequilla, agregar leche y queso cheddar rallado. 3. Mezclar hasta que la salsa espese. 4. Incorporar la pasta cocida y mezclar bien.', '2024-11-29 14:45:00', 3, '00:25:00', 3, 2),
	(37, 5, 2, 'Aguachile', 'Camarón crudo en limón con chile.', '1. Pelar y desvenar los camarones, abrirlos tipo mariposa. 2. Licuar limón, chile verde, sal y pepino para hacer el jugo de aguachile. 3. Colocar los camarones en un plato y bañarlos con el jugo. 4. Añadir pepino y cebolla morada en tiras. Reposar 15 minutos.', '2024-11-29 15:00:00', 4, '00:35:00', 3, 1),
	(38, 7, 3, 'Flan Napolitano', 'Postre suave y dulce.', '1. Licuar leche condensada, leche evaporada, huevos y vainilla. 2. Derretir azúcar en una olla pequeña para formar el caramelo y vaciarlo al molde. 3. Añadir la mezcla y hornear a baño maría durante 1 hora. 4. Dejar enfriar, refrigerar y desmoldar.', '2024-11-29 15:15:00', 2, '01:00:00', 8, 1),
	(39, 8, 4, 'Té Helado', 'Bebida refrescante con limón.', '1. Preparar té negro en agua caliente y dejar reposar 5 minutos. 2. Endulzar al gusto y dejar enfriar. 3. Agregar hielo y jugo de limón antes de servir. ', '2024-11-29 15:30:00', 1, '00:10:00', 2, 1),
	(40, 7, 5, 'Galletas de Mantequilla', 'Crujientes y dulces.', '1. Mezclar mantequilla con azúcar hasta obtener una crema suave. 2. Agregar harina, esencia de vainilla y formar una masa. 3. Formar bolitas, colocarlas en charola y aplastarlas ligeramente. 4. Hornear 12–15 minutos hasta dorar ligeramente.', '2024-11-29 15:45:00', 2, '00:30:00', 12, 1),
	(41, 3, 1, 'Ensalada de Frutas', 'Mezcla fresca de frutas.', '1. Lavar y picar manzana, plátano, papaya y fresas en cubos. 2. Mezclar todo en un bowl y añadir yogurt o miel si se desea. 3. Refrigerar antes de servir.', '2024-11-29 16:00:00', 1, '00:15:00', 4, 1),
	(42, 1, 2, 'Huevos con Chorizo', 'Clásico desayuno mexicano.', '1. Cocinar el chorizo en un sartén hasta que suelte grasa. 2. Agregar los huevos batidos y mezclar constantemente. 3. Cocinar hasta que el huevo esté firme pero suave.', '2024-11-29 16:15:00', 1, '00:12:00', 2, 1),
	(43, 2, 3, 'Sopa de Fideo', 'Caldo ligero con pasta.', '1. Freír el fideo en aceite hasta dorarlo ligeramente. 2. Licuar tomate, ajo y cebolla para formar una salsa. 3. Agregar la salsa al fideo y sofreír 1 minuto. 4. Añadir caldo y cocinar 12–15 minutos.', '2024-11-29 16:30:00', 1, '00:20:00', 4, 1),
	(44, 4, 4, 'Carne Asada', 'Carne jugosa con sazón.', '1. Sazonar la carne con sal, pimienta y jugo de limón. 2. Precalentar la parrilla y colocar la carne. 3. Asar al término deseado, volteando una vez. 4. Reposar 5 minutos antes de cortar.', '2024-11-29 16:45:00', 5, '00:50:00', 4, 1),
	(45, 4, 5, 'Torta de Jamón', 'Clásico lonche mexicano.', '1. Abrir el bolillo y untar mayonesa o crema. 2. Agregar jamón, jitomate, lechuga y queso al gusto. 3. Cerrar y servir.', '2024-11-29 17:00:00', 1, '00:10:00', 1, 1),
	(46, 5, 1, 'Mojarra Frita', 'Pescado frito crujiente.', '1. Limpiar la mojarra y hacer cortes en la piel. 2. Sazonar con sal, pimienta y limón. 3. Freír en aceite muy caliente hasta que esté dorada y crujiente.', '2024-11-29 17:15:00', 4, '00:45:00', 3, 1),
	(47, 8, 2, 'Atole de Vainilla', 'Bebida caliente espesa.', '1. Mezclar maicena con un poco de leche fría. 2. Calentar el resto de la leche con azúcar y vainilla. 3. Agregar la maicena disuelta y mover constantemente hasta espesar.', '2024-11-29 17:30:00', 2, '00:20:00', 4, 1),
	(48, 8, 3, 'Té de Manzanilla', 'Infusión clásica.', '1. Calentar agua hasta que hierva. 2. Añadir flores de manzanilla o bolsita y reposar 5 minutos. 3. Endulzar al gusto.', '2024-11-29 17:45:00', 1, '00:10:00', 2, 1),
	(49, 1, 4, 'Molletes', 'Pan con frijoles y queso.', '1. Cortar bolillos a la mitad y untar frijoles refritos. 2. Cubrir con queso rallado. 3. Hornear o gratinar hasta que el queso se derrita. 4. Agregar pico de gallo al servir.', '2024-11-29 18:00:00', 1, '00:15:00', 2, 1),
	(50, 8, 5, 'Té Chai Casero', 'Bebida especiada.', '1. Hervir agua con canela, clavo, jengibre y cardamomo. 2. Añadir té negro y reposar 3 minutos. 3. Colar, agregar leche y endulzar. 4. Calentar nuevamente antes de servir.', '2024-11-29 18:15:00', 3, '00:25:00', 2, 2),
	(51, 3, 1, 'Ensalada Verde', 'Lechuga con aderezo ligero.', '1. Lavar y desinfectar la lechuga, pepino y tomate. 2. Cortar en trozos y mezclar. 3. Agregar aderezo ligero o aceite con limón.', '2024-11-29 18:30:00', 1, '00:10:00', 4, 1),
	(55, 4, 13, 'Papa asada', 'Papa asada al horno con carne asada', '1. Poner la papa al horno', '2025-12-01 17:16:24', 5, '01:30:00', 1, 1);

-- Volcando datos para la tabla recetas.utensilios: ~3 rows (aproximadamente)
REPLACE INTO `utensilios` (`Ute_ID`, `Ute_Nombre`) VALUES
(1, 'Licuadora'),
(2, 'Vaso'),
(3, 'Cuchara'),
(4, 'Cuchillo'),
(5, 'Tabla de picar'),
(6, 'Sartén'),
(7, 'Olla'),
(8, 'Cazo pequeño'),
(9, 'Batidor globo'),
(10, 'Tazón'),
(11, 'Horno'),
(12, 'Charola para horno'),
(13, 'Espátula'),
(14, 'Colador'),
(15, 'Tenedor'),
(16, 'Refractario'),
(17, 'Molde para panqué'),
(18, 'Papel aluminio');

REPLACE INTO `recetas_utensilios` (`Rec_ID`, `Ute_ID`) VALUES
(1, 4),(1, 5),(1, 10),(1, 15),
(2, 4),(2, 5),(2, 10),(2, 3),
(3, 4),(3, 5),(3, 10),
(4, 4),(4, 5),(4, 10),(4, 3),
(5, 4),(5, 5),(5, 10),(5, 14),
(6, 10),(6, 1),(6, 2),
(7, 4),(7, 5),(7, 10),
(8, 4),(8, 5),(8, 10),(8, 3),
(9, 4),(9, 5),(9, 10),
(10, 4),(10, 5),(10, 10),(10, 15),
(11, 7),(11, 6),(11, 13),(11, 3),
(25, 6),(25, 7),(25, 4),(25, 13),
(26, 6),(26, 7),(26, 5),
(27, 6),(27, 7),(27, 4),(27, 10),
(28, 6),(28, 7),(28, 4),(28, 3),
(29, 6),(29, 7),(29, 14),
(30, 6),(30, 7),(30, 4),(30, 5);
(31, 10),(31, 9),(31, 11),(31, 12),
(32, 10),(32, 9),(32, 17),
(33, 10),(33, 1),(33, 2),
(34, 10),(34, 4),(34, 5),(34, 11),
(35, 10),(35, 9),(35, 12),(35, 18),
(36, 10),(36, 11),(36, 16),
(37, 10),(37, 9),
(38, 10),(38, 1),(38, 2),
(39, 10),(39, 9),(39, 11),(39, 12),
(40, 10),(40, 4),(40, 5),(40, 17);
(41, 6), (41, 10), (41, 1), (41, 9), (41, 18),
(42, 4), (42, 5), (42, 2), (42, 3),
(43, 4), (43, 5), (43, 16), (43, 6),
(44, 4), (44, 5), (44, 1), (44, 9),
(45, 6), (45, 10), (45, 1), (45, 9),
(46, 4), (46, 5), (46, 1),
(47, 4), (47, 5), (47, 1), (47, 9),
(48, 4), (48, 5), (48, 6),
(49, 2), (49, 12), (49, 1), (49, 9),
(50, 4), (50, 5), (50, 6),
(51, 6), (51, 10), (51, 14), (51, 13),
(52, 2), (52, 17), (52, 7),
(53, 6), (53, 10), (53, 13),
(54, 4), (54, 5), (54, 6),
(55, 4), (55, 5), (55, 1), (55, 9),
(56, 2), (56, 3), (56, 7),
(57, 4), (57, 5), (57, 15),
(58, 4), (58, 5), (58, 6),
(59, 4), (59, 5), (59, 1), (59, 9),
(60, 2), (60, 7), (60, 17),
(61, 2), (61, 7), 
(62, 4), (62, 5), (62, 13),
(63, 2), (63, 7), (63, 17),
(64, 4), (64, 5), (64, 6),
(65, 2), (65, 3), (65, 4), (65, 5);


-- Volcando datos para la tabla recetas.calificaciones: ~12 rows (aproximadamente)
REPLACE INTO `calificaciones` (`Cal_ID`, `Rec_ID`, `Usu_ID`, `Cal_Puntuacion`) VALUES
	(1, 1, 8, 8),
	(2, 2, 2, 7),
	(3, 3, 8, 9),
	(4, 4, 3, 6),
	(5, 5, 4, 10),
	(6, 1, 2, 5),
	(7, 3, 4, 7),
	(8, 2, 3, 8),
	(9, 4, 2, 4),
	(10, 5, 8, 9),
	(13, 11, 8, 9),
	(18, 25, 6, 10);

-- Volcando datos para la tabla recetas.comentarios: ~5 rows (aproximadamente)
REPLACE INTO `comentarios` (`Com_ID`, `Usu_ID`, `Rec_ID`, `Com_Comentario`) VALUES
	(1, 2, 1, '¡Muy buena receta!'),
	(2, 1, 2, 'Me gustó mucho el sabor'),
	(3, 2, 11, 'Ay caramba'),
	(4, 7, 11, 'Que interesante!'),
	(5, 8, 11, 'YIYI PAPA');

-- Volcando datos para la tabla recetas.favoritos: ~6 rows (aproximadamente)
REPLACE INTO `favoritos` (`Fav_ID`, `Usu_ID`, `Rec_ID`, `Fav_Fecha_Guardado`) VALUES
	(1, 1, 2, '2025-10-18 12:35:57'),
	(2, 2, 1, '2025-10-18 12:35:57'),
	(3, 6, 9, '2025-11-11 21:30:53'),
	(4, 6, 11, '2025-11-12 00:42:15'),
	(5, 8, 8, '2025-11-12 15:16:19'),
	(6, 6, 25, '2025-11-22 01:47:45');

-- Volcando datos para la tabla recetas.receta_imagenes: ~12 rows (aproximadamente)
REPLACE INTO `receta_imagenes` (`Img_ID`, `Rec_ID`, `Img_Rutas`) VALUES
	(1, 1, 'Imagenes/Recetas/1.png'),
	(2, 2, 'Imagenes/Recetas/2.png'),
	(3, 3, 'Imagenes/Recetas/3.png'),
	(4, 4, 'Imagenes/Recetas/4.png'),
	(5, 5, 'Imagenes/Recetas/5.png'),
	(6, 6, 'Imagenes/Recetas/6.png'),
	(7, 7, 'Imagenes/Recetas/7.png'),
	(8, 8, 'Imagenes/Recetas/8.png'),
	(9, 9, 'Imagenes/Recetas/9.png'),
	(10, 10, 'Imagenes/Recetas/10.png'),
	(11, 11, 'Imagenes/Recetas/11.png'),
	(12, 25, 'Imagenes/Recetas/25.jpg');

REPLACE INTO `receta_ingredientes` (`Rec_ID`, `Ing_ID`, `RI_Cantidad`, `RI_Unidad`, `RI_Notas`) VALUES
  (1, 1, '12', 'tortillas', NULL),
  (1, 2, '500', 'g', NULL),
  (1, 3, '40', 'g', 'Disuelto en jugo de piña'),
  (1, 4, '100', 'g', NULL),
  (1, 5, '0.5', 'pieza', 'Picada'),
  (1, 6, '0.25', 'taza', NULL),
  (2, 7, '1', 'pieza', 'Troceada'),
  (2, 8, '250', 'g', 'A la parrilla'),
  (2, 9, '50', 'g', 'Rallado'),
  (2, 10, '1', 'taza', NULL),
  (2, 18, '2', 'cucharadas', NULL),
  (2, 15, '1', 'diente', 'Picado'),
  (2, 101, '3', 'cucharadas', 'Para el aderezo'),
  (3, 11, '400', 'g', NULL),
  (3, 12, '350', 'g', NULL),
  (3, 13, '500', 'ml', NULL),
  (3, 14, '1', 'pieza', 'En cubos'),
  (3, 15, '2', 'dientes', NULL),
  (3, 93, '2', 'hojas', NULL),
  (4, 16, '3', 'piezas', NULL),
  (4, 17, '1', 'pieza', 'En cubos'),
  (4, 5, '0.25', 'pieza', 'Picada'),
  (4, 6, '0.25', 'taza', NULL),
  (4, 18, '1', 'cucharada', NULL),
  (5, 20, '300', 'g', 'Masa para pizza'),
  (5, 21, '200', 'g', NULL),
  (5, 13, '150', 'ml', 'Salsa base'),
  (5, 22, '10', 'hojas', NULL),
  (5, 99, '2', 'cucharadas', NULL),
  (6, 23, '2', 'tazas', NULL),
  (6, 24, '300', 'g', 'Troceado'),
  (6, 25, '200', 'g', NULL),
  (6, 26, '1', 'pieza', 'Picado'),
  (6, 98, '0.5', 'cucharadita', NULL),
  (7, 102, '400', 'g', NULL),
  (7, 35, '1', 'taza', NULL),
  (7, 12, '200', 'g', 'Cocido'),
  (7, 36, '0.5', 'taza', NULL),
  (7, 37, '80', 'g', 'Desmoronado'),
  (8, 100, '2', 'tazas', 'Cocido'),
  (8, 27, '4', 'hojas', NULL),
  (8, 28, '150', 'g', NULL),
  (8, 29, '0.5', 'pieza', 'En tiras'),
  (8, 30, '3', 'cucharadas', NULL),
  (9, 31, '12', 'piezas', NULL),
  (9, 12, '400', 'g', NULL),
  (9, 13, '600', 'ml', NULL),
  (9, 32, '200', 'g', NULL),
  (9, 21, '200', 'g', NULL),
  (9, 33, '250', 'ml', 'Para bechamel'),
  (10, 38, '6', 'piezas', NULL),
  (10, 8, '250', 'g', 'Desmenuzado'),
  (10, 35, '1', 'taza', NULL),
  (10, 36, '0.5', 'taza', NULL),
  (10, 7, '1', 'pieza', 'Rebanada'),
  (10, 37, '80', 'g', NULL),
  (11, 1, '4', 'tortillas', NULL),
  (11, 39, '150', 'g', NULL),
  (11, 86, '100', 'g', NULL),
  (11, 7, '4', 'hojas', NULL),
  (12, 33, '400', 'ml', NULL),
  (12, 40, '3', 'cucharadas', NULL),
  (12, 41, '2', 'cucharadas', NULL),
  (13, 1, '10', 'tortillas', 'Trianguladas'),
  (13, 42, '500', 'g', 'Para salsa'),
  (13, 19, '3', 'piezas', NULL),
  (13, 8, '200', 'g', 'Desmenuzado'),
  (13, 36, '0.5', 'taza', NULL),
  (13, 37, '80', 'g', NULL),
  (13, 5, '0.5', 'pieza', 'Fileteada'),
  (14, 51, '2', 'piezas', NULL),
  (14, 12, '300', 'g', 'Medallones'),
  (14, 52, '2', 'rebanadas', NULL),
  (14, 7, '4', 'hojas', NULL),
  (14, 17, '1', 'pieza', 'Rebanado'),
  (14, 5, '0.25', 'pieza', 'Caramelizada'),
  (15, 43, '500', 'g', 'Pre cocido'),
  (15, 2, '600', 'g', 'En trozos'),
  (15, 44, '5', 'piezas', NULL),
  (15, 103, '3', 'piezas', NULL),
  (15, 45, '1', 'cucharada', NULL),
  (15, 104, '3', 'piezas', 'Rebanado'),
  (15, 18, '2', 'piezas', NULL),
  (16, 20, '200', 'g', NULL),
  (16, 47, '2', 'piezas', NULL),
  (16, 33, '300', 'ml', NULL),
  (16, 34, '40', 'g', NULL),
  (16, 41, '3', 'cucharadas', NULL),
  (17, 24, '400', 'g', NULL),
  (17, 73, '200', 'ml', 'Jugo'),
  (17, 71, '3', 'cucharadas', NULL),
  (17, 72, '1', 'cucharadita', NULL),
  (17, 41, '2', 'cucharadas', NULL),
  (18, 74, '600', 'g', 'Con hueso'),
  (18, 53, '2', 'mazorcas', 'En trozos'),
  (18, 54, '2', 'piezas', 'En cubos'),
  (18, 14, '2', 'piezas', 'Rodajas'),
  (18, 55, '1', 'taza', 'Fileteado'),
  (18, 6, '0.25', 'taza', NULL),
  (19, 56, '200', 'g', NULL),
  (19, 20, '150', 'g', NULL),
  (19, 41, '150', 'g', NULL),
  (19, 47, '3', 'piezas', NULL),
  (19, 34, '120', 'g', NULL),
  (20, 50, '400', 'g', NULL),
  (20, 18, '8', 'piezas', 'Solo jugo'),
  (20, 29, '1', 'pieza', 'En cubos'),
  (20, 69, '0.5', 'pieza', 'Plumas'),
  (20, 6, '0.25', 'taza', NULL),
  (20, 17, '1', 'pieza', 'En cubos'),
  (21, 1, '4', 'tortillas', NULL),
  (21, 86, '200', 'g', NULL),
  (21, 6, '2', 'cucharadas', NULL),
  (22, 46, '1', 'taza', NULL),
  (22, 47, '2', 'piezas', NULL),
  (22, 33, '250', 'ml', NULL),
  (22, 57, '2', 'cucharadas', NULL),
  (22, 49, '1', 'cucharadita', NULL),
  (23, 1, '12', 'tortillas', NULL),
  (23, 8, '250', 'g', 'Desmenuzado'),
  (23, 103, '6', 'piezas', 'Hidratados'),
  (23, 36, '0.5', 'taza', NULL),
  (23, 37, '80', 'g', NULL),
  (23, 5, '0.5', 'pieza', 'Fileteada'),
  (24, 8, '300', 'g', NULL),
  (24, 58, '1', 'taza', NULL),
  (24, 14, '2', 'piezas', 'En cubos'),
  (24, 54, '2', 'piezas', 'En cubos'),
  (24, 59, '2', 'cucharadas', NULL),
  (24, 16, '1', 'pieza', 'En cubos'),
  (25, 60, '1', 'taza', NULL),
  (25, 33, '1', 'l', NULL),
  (25, 41, '0.75', 'taza', NULL),
  (25, 49, '2', 'ramas', NULL),
  (25, 48, '0.5', 'lata', NULL),
  (26, 105, '3', 'tazas', NULL),
  (26, 61, '150', 'g', NULL),
  (26, 62, '100', 'g', NULL),
  (26, 63, '2', 'piezas', 'Picado'),
  (26, 17, '2', 'piezas', 'En cubos'),
  (27, 54, '4', 'piezas', 'En gajos'),
  (27, 64, '3', 'cucharadas', NULL),
  (27, 65, '1', 'cucharadita', NULL),
  (27, 18, '2', 'cucharadas', NULL),
  (28, 20, '200', 'g', NULL),
  (28, 47, '2', 'piezas', NULL),
  (28, 33, '300', 'ml', NULL),
  (28, 34, '40', 'g', NULL),
  (28, 41, '2', 'cucharadas', NULL),
  (29, 74, '800', 'g', 'En trozos'),
  (29, 44, '6', 'piezas', NULL),
  (29, 103, '4', 'piezas', NULL),
  (29, 92, '1', 'cucharadita', NULL),
  (29, 91, '4', 'piezas', NULL),
  (29, 70, '0.25', 'taza', NULL),
  (30, 102, '500', 'g', NULL),
  (30, 8, '250', 'g', 'Desmenuzado'),
  (30, 42, '400', 'g', NULL),
  (30, 19, '3', 'piezas', NULL),
  (30, 67, '80', 'g', NULL),
  (30, 66, '20', 'hojas', 'Hidratadas'),
  (31, 68, '200', 'g', NULL),
  (31, 12, '250', 'g', NULL),
  (31, 52, '200', 'g', NULL),
  (31, 63, '4', 'piezas', 'En rodajas'),
  (31, 36, '0.25', 'taza', NULL),
  (31, 17, '1', 'pieza', 'Tipo pico de gallo'),
  (32, 88, '4', 'rebanadas', NULL),
  (32, 47, '2', 'piezas', NULL),
  (32, 33, '200', 'ml', NULL),
  (32, 49, '1', 'cucharadita', NULL),
  (32, 34, '30', 'g', NULL),
  (33, 87, '2', 'latas', NULL),
  (33, 17, '2', 'piezas', 'En cubos'),
  (33, 5, '0.5', 'pieza', 'Picada'),
  (33, 19, '1', 'pieza', 'Sin semillas'),
  (34, 74, '500', 'g', 'Fileteado'),
  (34, 47, '2', 'piezas', NULL),
  (34, 20, '0.5', 'taza', NULL),
  (34, 94, '1', 'taza', NULL),
  (34, 64, '1', 'taza', 'Para freír'),
  (35, 17, '3', 'piezas', 'En cubos'),
  (35, 5, '0.5', 'pieza', 'Finamente picada'),
  (35, 6, '0.25', 'taza', NULL),
  (35, 19, '1', 'pieza', 'Picado'),
  (35, 18, '2', 'cucharadas', NULL),
  (36, 95, '250', 'g', NULL),
  (36, 34, '40', 'g', NULL),
  (36, 33, '300', 'ml', NULL),
  (36, 52, '250', 'g', NULL),
  (37, 25, '300', 'g', NULL),
  (37, 18, '12', 'piezas', NULL),
  (37, 29, '1', 'pieza', 'En láminas'),
  (37, 69, '0.5', 'pieza', 'Plumas'),
  (37, 19, '3', 'piezas', 'Sin semillas'),
  (38, 48, '1', 'lata', NULL),
  (38, 77, '1', 'lata', NULL),
  (38, 47, '4', 'piezas', NULL),
  (38, 41, '0.75', 'taza', NULL),
  (38, 78, '1', 'cucharadita', NULL),
  (39, 79, '4', 'bolsas', 'Infusión'),
  (39, 41, '0.25', 'taza', NULL),
  (39, 18, '2', 'piezas', NULL),
  (40, 20, '250', 'g', NULL),
  (40, 34, '200', 'g', NULL),
  (40, 41, '120', 'g', NULL),
  (40, 78, '1', 'cucharadita', NULL),
  (41, 82, '1', 'pieza', 'En cubos'),
  (41, 83, '2', 'piezas', 'Rebanado'),
  (41, 84, '1', 'taza', NULL),
  (41, 85, '1', 'taza', NULL),
  (41, 81, '0.5', 'taza', NULL),
  (42, 47, '4', 'piezas', NULL),
  (42, 61, '200', 'g', NULL),
  (42, 1, '6', 'tortillas', NULL),
  (43, 96, '200', 'g', NULL),
  (43, 17, '3', 'piezas', 'Para salsa'),
  (43, 15, '2', 'dientes', NULL),
  (43, 106, '1.5', 'l', NULL),
  (44, 74, '700', 'g', NULL),
  (44, 18, '3', 'piezas', 'Jugo'),
  (44, 15, '2', 'dientes', NULL),
  (45, 75, '2', 'piezas', NULL),
  (45, 39, '4', 'rebanadas', NULL),
  (45, 7, '4', 'hojas', NULL),
  (45, 17, '1', 'pieza', 'Rebanado'),
  (45, 76, '2', 'rebanadas', NULL),
  (45, 101, '2', 'cucharadas', NULL),
  (46, 89, '2', 'piezas', NULL),
  (46, 15, '3', 'dientes', NULL),
  (46, 18, '3', 'piezas', NULL),
  (46, 64, '2', 'tazas', 'Para freír'),
  (47, 33, '1', 'l', NULL),
  (47, 97, '3', 'cucharadas', NULL),
  (47, 41, '0.5', 'taza', NULL),
  (47, 78, '1', 'cucharadita', NULL),
  (48, 80, '2', 'cucharadas', NULL),
  (48, 57, '2', 'cucharadas', NULL),
  (49, 75, '2', 'piezas', NULL),
  (49, 35, '1', 'taza', NULL),
  (49, 86, '150', 'g', NULL),
  (49, 17, '1', 'pieza', 'En cubos'),
  (49, 5, '0.25', 'pieza', 'En cubos'),
  (50, 79, '3', 'bolsas', NULL),
  (50, 49, '2', 'ramas', NULL),
  (50, 91, '4', 'piezas', NULL),
  (50, 90, '4', 'vainas', NULL),
  (50, 72, '6', 'rodajas', NULL),
  (50, 33, '400', 'ml', NULL),
  (51, 7, '1', 'pieza', 'Troceada'),
  (51, 29, '1', 'pieza', 'En rodajas'),
  (51, 17, '2', 'piezas', 'En cubos'),
  (51, 99, '2', 'cucharadas', NULL),
  (51, 18, '2', 'cucharadas', NULL),
  (55, 54, '4', 'piezas', 'Grandes'),
  (55, 74, '300', 'g', 'En tiras'),
  (55, 34, '40', 'g', NULL),
  (55, 36, '0.25', 'taza', NULL),
  (55, 52, '100', 'g', 'Rallado');

-- Volcando datos para la tabla recetas.reportes: ~2 rows (aproximadamente)
REPLACE INTO `reportes` (`Rep_ID`, `Usu_ID`, `Rep_Tipo_Obj`, `Rep_Obj_ID`, `Rep_Motivo`, `Rep_Fecha_Rea`, `Rep_Estado`) VALUES
  (1, 2, 'comentario', 1, 'Contenido inapropiado', '2025-10-18 12:35:57', 'pendiente'),
  (2, 3, 'comentario', 2, 'Spam', '2025-10-18 12:35:57', 'pendiente');  


-- Volcando datos para la tabla recetas.usuarios_seguidores: ~7 rows (aproximadamente)
REPLACE INTO `usuarios_seguidores` (`Seguidor_ID`, `Seguido_ID`, `Fecha_Seguimiento`) VALUES
	(1, 2, '2025-10-18 12:35:57'),
	(2, 3, '2025-10-18 12:35:57'),
	(6, 1, '2025-11-22 13:13:42'),
	(6, 2, '2025-11-22 13:31:09'),
	(6, 3, '2025-11-22 13:31:12'),
	(6, 4, '2025-11-22 13:31:15'),
	(6, 5, '2025-11-22 13:31:19');

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;

