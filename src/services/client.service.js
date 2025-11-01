import pool from "../config/db.js";

// Obtener datos del cliente
export const getClientData = async (phoneNumber) => {
  const [rows] = await pool.query(`
    SELECT dc.*, GROUP_CONCAT(mp.monto ORDER BY mp.monto ASC) as montos_permitidos
    FROM tbl_DirectorioClientes dc
    LEFT JOIN tbl_MontosPermitidos mp ON dc.id_cliente = mp.id_cliente
    WHERE dc.numero_whatsapp = ? AND dc.activo = 1
    GROUP BY dc.id_cliente
  `, [phoneNumber]);

  if (rows.length > 0) {
    const cliente = rows[0];
    cliente.montos_array = cliente.montos_permitidos
      ? cliente.montos_permitidos.split(',').map(m => parseFloat(m))
      : [];
    return cliente;
  }
  return null;
};

// Validar si el monto está permitido
export const isAmountAllowed = (cliente, monto) => {
  if (!cliente.montos_array || cliente.montos_array.length === 0) return true;
  return cliente.montos_array.includes(parseFloat(monto));
};
