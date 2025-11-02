import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const login = async (req, res) => {
  const { nombreUsuario, password } = req.body;

  try {
    const [rows] = await pool.query(
      "SELECT * FROM tbl_usuarios_redi WHERE nombre_usuario = ? AND activo = 1;",
      [nombreUsuario]
    );

    if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado" });

    const usuario = rows[0];

    // Comparar password con hash
    const valido = await bcrypt.compare(password, usuario.contrasenia_usuario);
    if (!valido) return res.status(401).json({ error: "Contraseña incorrecta" });

    // Generar token JWT
    const token = jwt.sign(
      { id: usuario.id_usuario_redi, rol: usuario.id_rol },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id_usuario_redi,
        nombreUsuario: usuario.nombre_usuario,
        rol: usuario.id_rol
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Error en servidor", detalle: err.message });    
    console.log(err.message);
    
  }
};
