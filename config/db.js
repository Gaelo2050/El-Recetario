// Configurar conexión a la base de datos MariaDB

/*const mariadb = require('mariadb');
const pool = mariadb.createPool({
  host: 'localhost',
  user: 'root',
  password: '123',
  database: 'recetas',
});*/

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.BD_HOST,
  user: process.env.BD_USER,
  password: process.env.BD_PASSWORD,
  database: process.env.BD_NAME,
});

module.exports = pool;
