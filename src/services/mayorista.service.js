import pool from "../config/db.js";

// Obtener datos del mayorista
export const getMayoristaData = async (phoneNumber) => {
  const [rows] = await pool.query(`
    SELECT
      dm.id_mayorista,
      dm.nombre_mayorista,
      dm.codigo_externo,
      dm.numero_whatsapp
    FROM chatBotRedi.tbl_directorio_mayoristas dm
    WHERE dm.numero_whatsapp = ?
      AND dm.activo = 1
    LIMIT 1;
  `, [phoneNumber]);

  if (rows.length > 0) {
    const mayorista = rows[0];
    return {
      tipo: "MAYORISTA",
      id_mayorista: mayorista.id_mayorista,
      codigo_mayorista: mayorista.codigo_externo,
      nombre_mayorista: mayorista.nombre_mayorista,
      numero_whatsapp: mayorista.numero_whatsapp
    };
  }

  return null;
};
