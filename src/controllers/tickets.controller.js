import pool from "../config/db.js";

// GET /api/tickets
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
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener tickets" });
  }
};

// POST /api/tickets
export const createTicket = async (req, res) => {
  const { numero, iccid, monto, id_compania, id_estado } = req.body;
  try {
    const [result] = await pool.query(
      `INSERT INTO tbl_TicketsRecarga (numero, iccid, monto, id_compania, id_estado) 
       VALUES (?, ?, ?, ?, ?)`,
      [numero, iccid, monto, id_compania, id_estado]
    );

    res.json({ id: result.insertId, message: "Ticket creado" });
  } catch (err) {
    res.status(500).json({ error: "Error al crear ticket" });
  }
};
