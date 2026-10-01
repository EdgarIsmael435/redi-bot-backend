import axios from "axios";
import pool from "../config/db.js";
import { getIO } from "../socket.js";

const ENROLAMIENTO_API_URL = process.env.ENROLAMIENTO_API_URL;
const ENROLAMIENTO_API_KEY = process.env.ENROLAMIENTO_API_KEY;

/*ENROLAMIENTO (solo Movistar)*/

export const esMovistar = (compania) => compania?.toUpperCase() === "MOVISTAR";

/**
 * Consulta si la línea está enrolada (vinculada)
 * Regresa true/false, o null si no se pudo verificar
 */
export const consultarEnrolamiento = async (dn) => {
  try {
    const url = `${ENROLAMIENTO_API_URL}/${encodeURIComponent(dn)}`;
    const { data } = await axios.get(url, {
      headers: {
        "x-api-key": ENROLAMIENTO_API_KEY,
        "ConsumerName": "Movistar",
      },
      timeout: 10000,
    });

    if (!data?.success || typeof data?.data?.enrolado !== "boolean") {
      console.error(`Respuesta inesperada de enrolamiento para ${dn}:`, data);
      return null;
    }

    return data.data.enrolado;
  } catch (error) {
    console.error(`Error consultando enrolamiento de ${dn}:`, error.response?.data || error.message);
    return null;
  }
};

/**
 * Consulta el enrolamiento de un ticket, lo guarda y avisa al front
 * Si no es Movistar no hace nada y regresa null
 */
export const verificarEnrolamientoTicket = async (ticketId) => {
  const [rows] = await pool.query(
    `SELECT numero, nombre_compania
      FROM chatBotRedi.tbl_tickets_recarga
      WHERE id_ticket_recarga = ?;`,
    [ticketId]
  );

  if (!rows.length) throw new Error(`Ticket ${ticketId} no encontrado`);

  const ticket = rows[0];
  if (!esMovistar(ticket.nombre_compania)) return null;

  const enrolado = await consultarEnrolamiento(ticket.numero);

  // Si falla la consulta no se pisa un valor previo
  if (enrolado !== null) {
    await pool.query(
      `UPDATE chatBotRedi.tbl_tickets_recarga
        SET enrolado = ?
        WHERE id_ticket_recarga = ?;`,
      [enrolado ? 1 : 0, ticketId]
    );

    getIO().emit("recharge-enrolamiento", {
      id_ticketRecarga: ticketId,
      Enrolado: enrolado ? 1 : 0,
    });
  }

  console.log(`Enrolamiento ticket ${ticketId} (${ticket.numero}):`, enrolado);
  return enrolado;
};

// Evita que se ejecuten dos barridos al mismo tiempo
let barridoEnCurso = false;

/**
 * Barrido: consulta el enrolamiento de todos los tickets Movistar pendientes
 * Se procesan por lotes para no saturar el API
 */
export const verificarEnrolamientoPendientes = async () => {
  if (barridoEnCurso) return { enCurso: true };
  barridoEnCurso = true;

  try {
    const [rows] = await pool.query(
      `SELECT id_ticket_recarga
        FROM chatBotRedi.tbl_tickets_recarga
        WHERE id_estado = 1
          AND UPPER(nombre_compania) = 'MOVISTAR';`
    );

    const resumen = { total: rows.length, vinculadas: 0, noVinculadas: 0, sinVerificar: 0 };
    const TAM_LOTE = 5;

    for (let i = 0; i < rows.length; i += TAM_LOTE) {
      const lote = rows.slice(i, i + TAM_LOTE);
      const resultados = await Promise.all(
        lote.map((r) =>
          verificarEnrolamientoTicket(r.id_ticket_recarga).catch((err) => {
            console.error(`Error en barrido, ticket ${r.id_ticket_recarga}:`, err.message);
            return null;
          })
        )
      );

      resultados.forEach((enrolado) => {
        if (enrolado === true) resumen.vinculadas++;
        else if (enrolado === false) resumen.noVinculadas++;
        else resumen.sinVerificar++;
      });
    }

    console.log("Barrido de enrolamiento terminado:", resumen);
    return resumen;
  } finally {
    barridoEnCurso = false;
  }
};
