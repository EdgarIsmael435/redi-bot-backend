import pool from "../config/db.js";

export const createImagenProcesada = async ({
  id_mayorista,
  path_imagen,
  hash_imagen,
  total_chips_detectados
}) => {
  const [result] = await pool.query(
    `
    INSERT INTO tbl_imagenes_procesadas
      (id_mayorista, path_imagen, hash_imagen, total_chips_detectados, fecha_expiracion)
    VALUES
      (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))
    `,
    [
      id_mayorista,
      path_imagen,
      hash_imagen || null,
      total_chips_detectados || 0
    ]
  );

  return { id_imagen: result.insertId };
};

export const createChipDetectado = async ({
  id_imagen,
  icc,
  dn,
  confianza_icc,
  confianza_dn
}) => {
  const [result] = await pool.query(
    `
    INSERT INTO tbl_chips_detectados
      (id_imagen, icc, dn, confianza_icc, confianza_dn)
    VALUES
      (?, ?, ?, ?, ?)
    `,
    [
      id_imagen,
      icc || null,
      dn || null,
      confianza_icc || null,
      confianza_dn || null
    ]
  );

  return { id_chip_detectado: result.insertId };
};

export const marcarChipDetectado = async (
  id_chip_detectado,
  estado,
  motivo = null
) => {
  await pool.query(
    `
    UPDATE tbl_chips_detectados
    SET estado = ?, motivo_invalido = ?
    WHERE id_chip_detectado = ?
    `,
    [
      estado,
      motivo,
      id_chip_detectado
    ]
  );
};
