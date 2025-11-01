import db from "../config/db.js";

export const getAllClients = async () => {
  const [rows] = await db.query(`
    SELECT 
      c.*, 
      p.descripcion AS prioridad,
      GROUP_CONCAT(m.monto ORDER BY m.monto ASC) AS montos
    FROM tbl_directorioclientes c
    JOIN cat_prioridadcliente p ON c.id_prioridadCliente = p.id_prioridadCliente
    LEFT JOIN tbl_montospermitidos m ON c.id_cliente = m.id_cliente
    GROUP BY c.id_cliente
    ORDER BY c.fechaRegistro DESC
  `);
  return rows;
};

export const getClientById = async (id) => {
  const [rows] = await db.query(`SELECT * FROM tbl_directorioclientes WHERE id_cliente = ?`, [id]);
  if (rows.length === 0) return null;

  const [montos] = await db.query(`SELECT * FROM tbl_montospermitidos WHERE id_cliente = ?`, [id]);
  return { ...rows[0], montos };
};

export const createClient = async (data) => {
  const { numero_whatsapp, nombre_cliente, nombre_distribuidor, id_prioridadCliente, montos } = data;
  const [result] = await db.query(
    `INSERT INTO tbl_directorioclientes (numero_whatsapp, nombre_cliente, nombre_distribuidor, id_prioridadCliente) VALUES (?, ?, ?, ?)`,
    [numero_whatsapp, nombre_cliente, nombre_distribuidor, id_prioridadCliente]
  );

  const id_cliente = result.insertId;

  if (montos?.length) {
    const values = montos.map(m => [id_cliente, m]);
    await db.query(`INSERT INTO tbl_montospermitidos (id_cliente, monto) VALUES ?`, [values]);
  }

  return { id_cliente };
};

export const updateClient = async (id, data) => {
  const { nombre_cliente, nombre_distribuidor, id_prioridadCliente, activo, montos } = data;

  const [res] = await db.query(
    `UPDATE tbl_directorioclientes SET nombre_cliente=?, nombre_distribuidor=?, id_prioridadCliente=?, activo=? WHERE id_cliente=?`,
    [nombre_cliente, nombre_distribuidor, id_prioridadCliente, activo, id]
  );

  if (montos) {
    await db.query(`DELETE FROM tbl_montospermitidos WHERE id_cliente=?`, [id]);
    const values = montos.map(m => [id, m]);
    await db.query(`INSERT INTO tbl_montospermitidos (id_cliente, monto) VALUES ?`, [values]);
  }

  return res.affectedRows > 0;
};

export const deleteClient = async (id) => {
  const [res] = await db.query(`DELETE FROM tbl_directorioclientes WHERE id_cliente=?`, [id]);
  return res.affectedRows > 0;
};

// Montos individuales
export const getMontosByClient = async (id_cliente) => {
  const [rows] = await db.query(`SELECT * FROM tbl_montospermitidos WHERE id_cliente=?`, [id_cliente]);
  return rows;
};

export const addMonto = async (id_cliente, monto) => {
  const [res] = await db.query(`INSERT INTO tbl_montospermitidos (id_cliente, monto) VALUES (?, ?)`, [id_cliente, monto]);
  return { id_monto: res.insertId, monto };
};

export const deleteMonto = async (id_monto) => {
  const [res] = await db.query(`DELETE FROM tbl_montospermitidos WHERE id_monto=?`, [id_monto]);
  return res.affectedRows > 0;
};
