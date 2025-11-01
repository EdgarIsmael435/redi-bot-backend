import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const login = async (req, res) => {
  const { nombreUsuario, password } = req.body;

  try {
    const [rows] = await pool.query(
      "SELECT * FROM tbl_usersRedi WHERE nombreUsuario = ? AND activo = 1",
      [nombreUsuario]
    );

    if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado" });

    const usuario = rows[0];

    // Comparar password con hash
    const valido = await bcrypt.compare(password, usuario.contraseniaUsuario);
    if (!valido) return res.status(401).json({ error: "Contraseña incorrecta" });

    // Generar token JWT
    const token = jwt.sign(
      { id: usuario.id_usuarioRedi, rol: usuario.id_rol },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id_usuarioRedi,
        nombreUsuario: usuario.nombreUsuario,
        rol: usuario.id_rol
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Error en servidor", detalle: err.message });
  }
};
