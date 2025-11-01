import pool from "../config/db.js";

// Historico
export const getTickets = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.*, c.nombre AS compania, e.descripcion AS estado, o.nombre AS operador
      FROM tbl_TicketsRecarga t
      INNER JOIN cat_Companias c ON t.id_compania = c.id_compania
      INNER JOIN cat_Estados e ON t.id_estado = e.id_estado
      LEFT JOIN tbl_Operadores o ON t.id_operador = o.id_operador
      ORDER BY t.fechaRegistro DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("❌ Error al obtener tickets:", err.message);
    res.status(500).json({ success: false, error: "Error al obtener tickets" });
  }
};
