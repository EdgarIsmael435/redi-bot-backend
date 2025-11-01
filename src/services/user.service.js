import db from "../config/db.js";
import bcrypt from "bcryptjs";

/**
 * Obtener todos los usuarios
 */
export const getAll = async () => {
  const [rows] = await db.query(`
    SELECT 
      id_usuarioRedi,
      nombreUsuario,
      nombre,
      apellido,
      id_rol,
      numeroOperador,
      activo
    FROM chatbotred.tbl_usersRedi
    ORDER BY id_usuarioRedi DESC
  `);
  return rows;
};

/**
 * Obtener usuario por ID
 */
export const getById = async (id) => {
  const [rows] = await db.query(
    "SELECT * FROM chatbotred.tbl_usersRedi WHERE id_usuarioRedi = ?",
    [id]
  );
  return rows[0];
};

/**
 * Crear un nuevo usuario (con hash de contraseña)
 */
export const create = async (data) => {
  const { nombreUsuario, nombre, apellido, contraseniaUsuario, id_rol, activo } = data;

  // Encriptar contraseña antes de guardar
  const hashedPassword = await bcrypt.hash(contraseniaUsuario, 10);

  const [result] = await db.query(
    `INSERT INTO chatbotred.tbl_usersRedi 
      (nombreUsuario, nombre, apellido, contraseniaUsuario, id_rol, activo)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [nombreUsuario, nombre, apellido, hashedPassword, id_rol, activo]
  );

  return {
    id_usuarioRedi: result.insertId,
    nombreUsuario,
    nombre,
    apellido,
    id_rol,
    activo,
  };
};

/**
 * Actualizar un usuario existente (solo encripta si se envía nueva contraseña)
 */
export const update = async (id, data) => {
  const { nombreUsuario, nombre, apellido, contraseniaUsuario, id_rol, activo } = data;

  let query = `
    UPDATE chatbotred.tbl_usersRedi
    SET nombreUsuario=?, nombre=?, apellido=?, id_rol=?, activo=?
  `;
  const params = [nombreUsuario, nombre, apellido, id_rol, activo];

  // Si se envió nueva contraseña, encriptarla
  if (contraseniaUsuario) {
    const hashedPassword = await bcrypt.hash(contraseniaUsuario, 10);
    query += `, contraseniaUsuario=?`;
    params.push(hashedPassword);
  }

  query += ` WHERE id_usuarioRedi = ?`;
  params.push(id);

  await db.query(query, params);

  return { id, nombreUsuario, nombre, apellido, id_rol, activo };
};

/**
 * Eliminar un usuario
 */
export const remove = async (id) => {
  await db.query("DELETE FROM chatbotred.tbl_usersRedi WHERE id_usuarioRedi = ?", [id]);
  return true;
};
