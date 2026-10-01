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

// Reporte (lista del panel por rango de fechas de solicitud, sin fechas = todo)
export const getReporteTickets = async (req, res) => {
  const { desde, hasta } = req.query;
  const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || "");
  const todo = !desde && !hasta;

  if (!todo && (!fechaValida(desde) || !fechaValida(hasta))) {
    return res.status(400).json({ success: false, error: "Fechas inválidas (formato YYYY-MM-DD)" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT 
        tk.id_ticket_recarga AS id_ticketRecarga,
        es.descripcion AS Estado,
        tk.nombre_compania AS Compania,
        tk.producto AS Producto,
        tk.mayorista AS Mayorista,
        tk.monto AS Monto,
        tk.numero AS Numero,
        tk.enrolado AS Enrolado,
        tk.fecha_panza AS FechaPanza,
        tk.folio AS Folio,
        tk.folio_auto AS FolioAuto,
        tk.fecha_registro AS FechaSolicitud,
        tk.fecha_folio AS FechaFolio,
        dir.nombre_cliente AS Cliente,
        dir.nombre_distribuidor AS Distribuidor,
        pr.descripcion AS PrioridadCliente,
        u.nombre AS Operador
      FROM chatBotRedi.tbl_tickets_recarga tk
      INNER JOIN chatBotRedi.cat_estados_recarga es 
          ON tk.id_estado = es.id_estado
      INNER JOIN chatBotRedi.tbl_directorio_clientes dir 
          ON tk.id_cliente = dir.id_cliente
      INNER JOIN chatBotRedi.cat_prioridad_cliente pr 
          ON dir.id_prioridad_cliente = pr.id_prioridad_cliente
      LEFT JOIN chatBotRedi.tbl_usuarios_redi u 
          ON tk.id_usuario_redi = u.id_usuario_redi
      ${todo ? "" : "WHERE DATE(tk.fecha_registro) BETWEEN ? AND ?"}
      ORDER BY tk.id_ticket_recarga DESC;`,
      todo ? [] : [desde, hasta]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error al obtener reporte de tickets:", err.message);
    res.status(500).json({ success: false, error: "Error al obtener reporte" });
  }
};
