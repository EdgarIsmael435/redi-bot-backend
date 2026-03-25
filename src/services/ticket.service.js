import pool from "../config/db.js";
import { sendWhatsAppMessage, sendStickerMessage } from "./whatsapp.service.js";
import { getIO } from "../socket.js";
import { updateChipRecharge, releaseChip } from "./chip.service.js";
import { STICKERS } from "../constants/stickers.js";

// Asignamos Folio Falso
export const iniciarTimerFolio = (ticketId) => {
  console.log("Iniciar Timer");
  setTimeout(async () => {
    try {
      const [rows] = await pool.query(
        `SELECT 
            tk.msg_id                AS id_mensaje,
            tk.id_ticket_recarga     AS id_ticketRecarga,
            dir.numero_whatsapp      AS NumeroWhatsApp,
            es.descripcion           AS Estado,
            tk.nombre_compania       AS Compania,
            tk.monto                 AS Monto,
            tk.numero                AS Numero,
            tk.fecha_panza           AS FechaPanza,
            tk.folio                 AS Folio,
            tk.fecha_registro        AS FechaSolicitud,
            dir.nombre_cliente       AS Cliente,
            dir.nombre_distribuidor  AS Distribuidor,
            pr.descripcion           AS PrioridadCliente,
            tk.id_cliente            AS id_cliente
          FROM chatBotRedi.tbl_tickets_recarga tk
          INNER JOIN chatBotRedi.cat_estados_recarga es 
            ON tk.id_estado = es.id_estado
          INNER JOIN chatBotRedi.tbl_directorio_clientes dir 
            ON tk.id_cliente = dir.id_cliente
          INNER JOIN chatBotRedi.cat_prioridad_cliente pr 
            ON dir.id_prioridad_cliente = pr.id_prioridad_cliente
          WHERE tk.id_ticket_recarga = ?;`,
        [ticketId]
      );

      const ticket = rows[0];

      if (rows.length && !ticket.Folio) {
        const folioAuto = `1104${ticketId}`;
        await pool.query(
          `UPDATE chatBotRedi.tbl_tickets_recarga
            SET 
              fecha_folio = NOW(),
              folio_auto = 1
            WHERE id_ticket_recarga = ?;`,
          [ticketId]
        );

        // Emitir actualización al front
        const io = getIO();
        io.emit("recharge-updated", {
          ...ticket,
          FolioFalso: folioAuto,
          FolioAuto: 1,
        });

        //Valida Primer Recarga del Día
        const [rowsFirstR] = await pool.query(
          `SELECT COUNT(*) AS total
        FROM chatBotRedi.tbl_tickets_recarga
        WHERE id_cliente = ?
        AND DATE(fecha_folio) = CURDATE();`,
          [ticket.id_cliente]
        );

        let messagePersonalizate = "";

        const firstRechargeDay = rowsFirstR[0].total === 1;
        if (firstRechargeDay) {
          messagePersonalizate += "🎉 *¡Felicidades por tu primera recarga del día!* 💥\n\n";
        }

        await sendWhatsAppMessage(
          ticket.NumeroWhatsApp,
          `✅ *¡Listo! He recargado tu sim, te comparto los detalles:*\n\n` +
          `👤 Cliente: ${ticket.Cliente}\n` +
          `🏪 Sucursal: ${ticket.Distribuidor}\n` +
          `💰 Monto: $${ticket.Monto}\n` +
          `📄 Folio: *${folioAuto}*\n\n` +
          messagePersonalizate +
          `Gracias por seguir recargando con REDi 🤖🚀`,
          ticket.id_mensaje
        );

        console.log(`Folio automático generado para ticket ${ticketId}: ${folioAuto}`);
      }
    } catch (err) {
      console.error("Error en timer de folio:", err.message);
    }
  }, 1 * 60 * 1000); // 2 minutos
};

// Asignamos Folio Operador
export const asignarFolio = async (ticketId, folio, estado, id_usuario_redi, esFolioFalso, nombreOperador) => {
  console.log("Asignar folio");
  try {
    //Guardar folio en la BD
    const [result] = await pool.query(
      `UPDATE chatBotRedi.tbl_tickets_recarga
        SET 
          folio = ?, 
          fecha_folio = NOW(), 
          id_estado = ?,
          id_usuario_redi = ?
        WHERE id_ticket_recarga = ?;`,
      [folio, estado, id_usuario_redi, ticketId]
    );

    if (result.affectedRows === 0) {
      throw new Error(`Ticket ${ticketId} no encontrado`);
    }

    //Recuperar datos para responder al cliente
    const [rows] = await pool.query(
      `SELECT 
          c.numero_whatsapp, 
          t.numero,
          t.monto, 
          t.folio, 
          c.nombre_cliente, 
          c.nombre_distribuidor, 
          t.msg_id, 
          t.id_ticket_recarga, 
          t.id_chip_red, 
          t.id_cliente
        FROM chatBotRedi.tbl_tickets_recarga t
        JOIN chatBotRedi.tbl_directorio_clientes c 
          ON t.id_cliente = c.id_cliente
        WHERE t.id_ticket_recarga = ?;`,
      [ticketId]
    );

    if (!rows.length) throw new Error("Ticket no encontrado");

    const ticket = rows[0];

    if (ticket.id_chip_red !== null) {
      //Llamar API Laravel para actualizar chip
      try {
        await updateChipRecharge({
          id: ticket.id_chip_red,
          recarga: ticket.monto,
          fechaRecarga: new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" }),
          folio: ticket.folio,
          usuarioRecarga: nombreOperador,
          nombreCliente: ticket.nombre_cliente,
          dn: ticket.numero
        });
        console.log(`Chip actualizado en Laravel para ticket ${ticketId}`);
      } catch (apiErr) {
        console.error("Error actualizando chip en Laravel:", apiErr.message);
      }
    }

    if (!esFolioFalso) {
      //Mandar mensaje al cliente por WhatsApp

      //Valida Primer Recarga del Día
      const [rowsFirstR] = await pool.query(
        `SELECT COUNT(*) AS total
        FROM chatBotRedi.tbl_tickets_recarga
        WHERE id_cliente = ?
        AND DATE(fecha_folio) = CURDATE();`,
        [ticket.id_cliente]
      );

      let messagePersonalizate = "";

      const firstRechargeDay = rowsFirstR[0].total === 1;
      if (firstRechargeDay) {
        messagePersonalizate += `🎉 *¡Felicidades por tu primera recarga del día, ${ticket.nombre_cliente}!* 💥\n\n`;
      }

      await sendWhatsAppMessage(
        ticket.numero_whatsapp,
        `✅ *¡Listo! He recargado tu sim, te comparto los detalles:*\n\n` +
        `👤 Cliente: ${ticket.nombre_cliente}\n` +
        `💰 Monto: $${ticket.monto}\n` +
        `📄 Folio: *${ticket.folio}*\n\n` +
        messagePersonalizate +
        `Gracias por seguir recargando con REDi 🤖🚀`,
        ticket.msg_id
      );

      await sendStickerMessage(ticket.numero_whatsapp, STICKERS.venta);


      console.log(`Folio enviado al cliente ${ticket.numero_whatsapp}: ${ticket.folio}`);
    }
    return true;
  } catch (err) {
    console.error("Error asignando folio:", err.message);
    return false;
  }
};

export const createTicket = async (from, cliente, chip, monto, respApi, messageId) => {
  console.log("Crear ticket");
  const fechaPanza = respApi?.data?.fecha_panza ?? respApi?.fecha_panza ?? null;
  console.log(fechaPanza);
  try {
    const [result] = await pool.query(
      `INSERT INTO chatBotRedi.tbl_tickets_recarga 
      (numero, iccid, monto, nombre_compania, id_estado, folio, id_chip_red, msg_id, reliability, match_by, id_cliente, fecha_panza)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        chip.dn,
        chip.icc,
        monto,
        chip.compania,
        1,
        null,
        chip.id,
        messageId,
        respApi.reliability || null,
        respApi.by || null,
        cliente.id_cliente,
        fechaPanza
      ]
    );

    const reliabilityText = respApi.reliability ? `${respApi.reliability}% confiabilidad` : "";
    /* const entregaFormato = new Date(`${chip.entrega}T00:00:00`).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
    */

    let msgIsValidate = chip.id !== null ? `💰 Monto: $${monto}\n` : ``;

    await sendWhatsAppMessage(
      from,
      `✅ *He registrado tu ticket exitosamente, te comparto los detalles:*\n\n` +
      `👤 Cliente: ${cliente.nombre_cliente}\n` +
      `📱 Número: ${chip.dn}\n` +
      `🔢 ICCID: ${chip.icc}\n` +
      `📡 Compañía: ${chip.compania}\n` +
      msgIsValidate +
      `🎯 ${reliabilityText}\n\n` +
      `🆔 *ID Ticket:* ${result.insertId}\n` +
      `⏳ *Estado:* Pendiente de procesamiento\n` +
      `⏱️ Tiempo estimado: 1 minuto\n\n`,
      messageId
    );

    sendStickerMessage(from, STICKERS.proceso);

    const ticketId = result.insertId;

    // Emitir nueva recarga al front
    const io = getIO();

    io.emit("new-recharge", {
      id_ticketRecarga: ticketId,
      Numero: chip.dn,
      Monto: monto,
      Compania: chip.compania,
      FechaPanza: fechaPanza,
      Cliente: cliente.nombre_cliente,
      PrioridadCliente: cliente.prioridad_cliente,
      Distribuidor: cliente.nombre_distribuidor,
      Estado: "PENDIENTE",
    });

    iniciarTimerFolio(ticketId, 2);
    return ticketId;
  } catch (dbError) {
    console.error("Error insertando ticket:", dbError);
    await sendWhatsAppMessage(from, "No pude guardar tu ticket, intenta de nuevo 😥\nSi el problema continua reportame, tal vez este sufriendo un problema 😫", messageId);
    try {
      if (chip?.icc || chip?.dn) {
        await releaseChip(chip.icc, chip.dn);
      }
    } catch (apiErr) {
      console.error("Error liberando chip tras fallo:", apiErr.message);
    }
    throw dbError;
  }
};
