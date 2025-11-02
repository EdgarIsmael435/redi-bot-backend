import pool from "../config/db.js";

// Historico
export const getTickets = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        t.*, 
        e.descripcion AS estado,
        u.nombre AS operador
      FROM chatBotRedi.tbl_tickets_recarga t
      INNER JOIN chatBotRedi.cat_estados_recarga e 
          ON t.id_estado = e.id_estado
      LEFT JOIN chatBotRedi.tbl_usuarios_redi u 
          ON t.id_usuario_redi = u.id_usuario_redi
      ORDER BY t.fecha_registro DESC;`);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error al obtener tickets:", err.message);
    res.status(500).json({ success: false, error: "Error al obtener tickets" });
  }
};
