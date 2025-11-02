import db from "../config/db.js";

export const getAllClients = async () => {
  const [rows] = await db.query(`
    SELECT 
      c.*, 
      p.descripcion AS prioridad,
      GROUP_CONCAT(m.monto ORDER BY m.monto ASC) AS montos
    FROM chatBotRedi.tbl_directorio_clientes c
    INNER JOIN chatBotRedi.cat_prioridad_cliente p 
      ON c.id_prioridad_cliente = p.id_prioridad_cliente
    LEFT JOIN chatBotRedi.tbl_montos_permitidos m 
      ON c.id_cliente = m.id_cliente
    GROUP BY c.id_cliente
    ORDER BY c.fecha_registro DESC;`);
  return rows;
};

export const getClientById = async (id) => {
  const [rows] = await db.query(`SELECT * FROM chatBotRedi.tbl_directorio_clientes WHERE id_cliente = ?;`, [id]);
  if (rows.length === 0) return null;

  const [montos] = await db.query(`SELECT * FROM chatBotRedi.tbl_montos_permitidos WHERE id_cliente = ?;`, [id]);
  return { ...rows[0], montos };
};

export const createClient = async (data) => {
  const { numero_whatsapp, nombre_cliente, nombre_distribuidor, id_prioridad_cliente, montos } = data;
  const [result] = await db.query(
    `INSERT INTO chatBotRedi.tbl_directorio_clientes 
    (numero_whatsapp, nombre_cliente, nombre_distribuidor, id_prioridad_cliente)
    VALUES (?, ?, ?, ?);`,
    [numero_whatsapp, nombre_cliente, nombre_distribuidor, id_prioridad_cliente]
  );

  const id_cliente = result.insertId;

  if (montos?.length) {
    const values = montos.map(m => [id_cliente, m]);
    await db.query(`INSERT INTO chatBotRedi.tbl_montos_permitidos (id_cliente, monto) VALUES ?;`, [values]);
  }

  return { id_cliente };
};

export const updateClient = async (id, data) => {
  const { numero_whatsapp, nombre_cliente, nombre_distribuidor, id_prioridad_cliente, activo, montos } = data;

  const [res] = await db.query(
    `UPDATE chatBotRedi.tbl_directorio_clientes SET 
      numero_whatsapp =?,
      nombre_cliente = ?, 
      nombre_distribuidor = ?, 
      id_prioridad_cliente = ?, 
      activo = ? WHERE id_cliente = ?;`,
    [numero_whatsapp, nombre_cliente, nombre_distribuidor, id_prioridad_cliente, activo, id]
  );

  if (montos) {
    await db.query(`DELETE FROM chatBotRedi.tbl_montos_permitidos WHERE id_cliente = ?`, [id]);
    const values = montos.map(m => [id, m]);
    await db.query(`INSERT INTO chatBotRedi.tbl_montos_permitidos (id_cliente, monto) VALUES ?;`, [values]);
  }

  return res.affectedRows > 0;
};

export const deleteClient = async (id) => {
  const [res] = await db.query(`DELETE FROM chatBotRedi.tbl_directorio_clientes WHERE id_cliente = ?;`, [id]);
  return res.affectedRows > 0;
};

// Montos individuales
export const getMontosByClient = async (id_cliente) => {
  const [rows] = await db.query(`SELECT * FROM chatBotRedi.tbl_montos_permitidos WHERE id_cliente = ?;`, [id_cliente]);
  return rows;
};

export const addMonto = async (id_cliente, monto) => {
  const [res] = await db.query(`INSERT INTO chatBotRedi.tbl_montos_permitidos (id_cliente, monto) VALUES (?, ?);`, [id_cliente, monto]);
  return { id_monto: res.insertId, monto };
};

export const deleteMonto = async (id_monto) => {
  const [res] = await db.query(`DELETE FROM chatBotRedi.tbl_montos_permitidos WHERE id_monto = ?;`, [id_monto]);
  return res.affectedRows > 0;
};
