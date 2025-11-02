import db from "../config/db.js";
import bcrypt from "bcryptjs";

/**
 * Obtener todos los usuarios
 */
export const getAll = async () => {
  const [rows] = await db.query(`
    SELECT 
      id_usuario_redi,
      nombre_usuario,
      nombre,
      apellido,
      id_rol,
      numero_operador,
      activo
    FROM chatBotRedi.tbl_usuarios_redi
    ORDER BY id_usuario_redi DESC;`);
  return rows;
};

/**
 * Obtener usuario por ID
 */
export const getById = async (id) => {
  const [rows] = await db.query(
    "SELECT * FROM chatBotRedi.tbl_usuarios_redi WHERE id_usuario_redi = ?",
    [id]
  );
  return rows[0];
};

/**
 * Crear un nuevo usuario (con hash de contraseña)
 */
export const create = async (data) => {
  const { nombre_usuario, nombre, apellido, contrasenia_usuario, id_rol, activo } = data;

  // Encriptar contraseña antes de guardar
  const hashedPassword = await bcrypt.hash(contrasenia_usuario, 10);

  const [result] = await db.query(
    `INSERT INTO chatBotRedi.tbl_usuarios_redi 
      (nombre_usuario, nombre, apellido, contrasenia_usuario, id_rol, activo)
    VALUES (?, ?, ?, ?, ?, ?);`,
    [nombre_usuario, nombre, apellido, hashedPassword, id_rol, activo]
  );

  return {
    id_usuarioRedi: result.insertId,
    nombre_usuario,
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
  const { nombre_usuario, nombre, apellido, contrasenia_usuario, id_rol, activo } = data;

  let query = `
        UPDATE chatBotRedi.tbl_usuarios_redi
        SET 
        nombre_usuario = ?, 
        nombre = ?, 
        apellido = ?, 
        id_rol = ?, 
        activo = ?`;
  const params = [nombre_usuario, nombre, apellido, id_rol, activo];

  // Si se envió nueva contraseña, encriptarla
  if (contrasenia_usuario) {
    const hashedPassword = await bcrypt.hash(contrasenia_usuario, 10);
    query += `, contrasenia_usuario=?`;
    params.push(hashedPassword);
  }

  query += ` WHERE id_usuario_redi = ?`;
  params.push(id);

  await db.query(query, params);

  return { id, nombre_usuario, nombre, apellido, id_rol, activo };
};

/**
 * Eliminar un usuario
 */
export const remove = async (id) => {
  await db.query("DELETE FROM chatBotRedi.tbl_usuarios_redi WHERE id_usuario_redi = ?;", [id]);
  return true;
};
