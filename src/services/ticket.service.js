import pool from "../config/db.js";
import { sendWhatsAppMessage, sendStickerMessage } from "./whatsapp.service.js";
import { getIO } from "../socket.js";
import { updateChipRecharge } from "./chip.service.js";
import { STICKERS } from "../constants/stickers.js";

// Asignamos Folio Falso
export const iniciarTimerFolio = (ticketId) => {
  console.log("Iniciar Timer");
  setTimeout(async () => {
    try {
      const [rows] = await pool.query(
        `SELECT             
            tk.msg_id AS id_mensaje,
            tk.id_ticketRecarga AS id_ticketRecarga,
            dir.numero_whatsapp AS NumeroWhatsApp,
            es.descripcion AS Estado,
            tk.nombre_compania AS Compania,
            tk.monto AS Monto,
            tk.numero AS Numero,
            tk.folio AS Folio,
            tk.fechaRegistro AS FechaSolicitud,
            dir.nombre_cliente AS Cliente,
            dir.nombre_distribuidor AS Distribuidor,
            pr.descripcion AS PrioridadCliente
            FROM chatbotred.tbl_TicketsRecarga tk
            INNER JOIN chatbotred.cat_estados es ON tk.id_estado = es.id_estado
            INNER JOIN chatbotred.tbl_DirectorioClientes dir ON tk.id_cliente = dir.id_cliente 
            INNER JOIN chatbotred.cat_prioridadCliente pr ON dir.id_prioridadCliente = pr.id_prioridadCliente
            WHERE tk.id_ticketRecarga = ?`,
        [ticketId]
      );

      const ticket = rows[0];

      if (rows.length && !ticket.Folio) {
        const folioAuto = `AUTO-${ticketId}`;
        await pool.query(
          `UPDATE tbl_TicketsRecarga 
           SET 
           fechaFolio = NOW(), folioAuto = 1
           WHERE id_ticketRecarga = ?`,
          [ticketId]
        );
        /* await pool.query(
          `UPDATE tbl_TicketsRecarga 
           SET 
           --folio = ?, 
           fechaFolio = NOW(), folioAuto = 1
           WHERE id_ticketRecarga = ?`,
          [folioAuto, ticketId]
        ); */

        // Emitir actualización al front
        const io = getIO();
        io.emit("recharge-updated", {
          ...ticket,
          FolioFalso: folioAuto,
          FolioAuto: 1,
        });

        // Avisar al cliente
        await sendWhatsAppMessage(
          ticket.NumeroWhatsApp,
          `✅ *Recarga completada*\n\n` +
          `💰 Monto: $${ticket.Monto}\n` +
          `📄 Folio: *${folioAuto}*\n\n` +
          `⚠️ Este folio fue generado automáticamente por tiempo de espera.`,
          ticket.id_mensaje
        );

        console.log(`⏱️ Folio automático generado para ticket ${ticketId}: ${folioAuto}`);
      }
    } catch (err) {
      console.error("❌ Error en timer de folio:", err.message);
    }
  }, 1 * 60 * 1000); // 2 minutos
};

// Asignamos Folio Operador
export const asignarFolio = async (ticketId, folio, estado, esFolioFalso, nombreOperador) => {
  console.log("Asignar folio");
  try {
    // 1. Guardar folio en la BD
    const [result] = await pool.query(
      `UPDATE tbl_TicketsRecarga
       SET folio = ?, fechaFolio = NOW(), id_estado = ?
       WHERE id_ticketRecarga = ?`,
      [folio, estado, ticketId]
    );

    if (result.affectedRows === 0) {
      throw new Error(`Ticket ${ticketId} no encontrado`);
    }

    if (!esFolioFalso) {

      // 2. Recuperar datos para responder al cliente
      const [rows] = await pool.query(
        `SELECT c.numero_whatsapp, t.monto, 
        t.folio, c.nombre_cliente, c.nombre_distribuidor, 
        t.msg_id, t.id_ticketRecarga, t.id_chip_red, t.id_cliente
       FROM tbl_TicketsRecarga t
       JOIN tbl_DirectorioClientes c ON t.id_cliente = c.id_cliente
       WHERE t.id_ticketRecarga = ?`,
        [ticketId]
      );

      if (!rows.length) throw new Error("Ticket no encontrado");

      const ticket = rows[0];

      // 3. Llamar API Laravel para actualizar chip
      try {
        await updateChipRecharge({
          id: ticket.id_chip_red,
          recarga: ticket.monto,
          fechaRecarga: new Date().toISOString(),
          folio: ticket.folio,
          usuario: nombreOperador,
          observaciones: "Recarga completada desde dashboard REDi"
        });
        console.log(`✅ Chip actualizado en Laravel para ticket ${ticketId}`);
      } catch (apiErr) {
        console.error("⚠️ Error actualizando chip en Laravel:", apiErr.message);
      }

      // 4. Mandar mensaje al cliente por WhatsApp

      //Valida Primer Recarga del Día
      const [rowsFirstR] = await pool.query(
        `SELECT COUNT(*) AS total
        FROM tbl_TicketsRecarga
        WHERE id_cliente = ? 
        AND DATE(fechaFolio) = CURDATE()`,
        [ticket.id_cliente]
      );

      let messagePersonalizate = "";

      const firstRechargeDay = rowsFirstR[0].total === 1;
      if (firstRechargeDay) {
        messagePersonalizate += "🎉 *¡Felicidades por tu primera recarga del día!* 💥\n\n";
      }

      await sendWhatsAppMessage(
        ticket.numero_whatsapp,
        `✅ *Recarga completada*\n\n` +
        `👤 Cliente: ${ticket.nombre_cliente}\n` +
        `🏪 Distribuidor: ${ticket.nombre_distribuidor}\n` +
        `💰 Monto: $${ticket.monto}\n` +
        `📄 Folio: *${ticket.folio}*\n\n` +
         messagePersonalizate +
        `🤖 Gracias por seguir recargando con REDi 🚀`,
        ticket.msg_id
      );

      await sendStickerMessage(ticket.numero_whatsapp, STICKERS.venta);
      

      console.log(`📩 Folio enviado al cliente ${ticket.numero_whatsapp}: ${ticket.folio}`);
    }
    return true;
  } catch (err) {
    console.error("❌ Error asignando folio:", err.message);
    return false;
  }
};

export const createTicket = async (from, cliente, chip, monto, respApi, messageId) => {
  console.log("Crear ticket");
  try {
    const [result] = await pool.query(
      `INSERT INTO tbl_TicketsRecarga 
       (numero, iccid, monto, nombre_compania, id_estado, folio, id_chip_red, msg_id, reliability, match_by, id_cliente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ]
    );

    const statusIcon = respApi.status === "success" ? "✅" : "⚠️";
    const reliabilityText = respApi.reliability ? ` (${respApi.reliability}% confiabilidad)` : "";
    const entregaFormato = new Date(chip.entrega).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
    await sendWhatsAppMessage(
      from,
      `${statusIcon} *Ticket registrado exitosamente*\n\n` +
      `👤 Cliente: ${cliente.nombre_cliente}\n` +
      `🏪 Distribuidor: ${cliente.nombre_distribuidor}\n` +
      `📱 Número: ${chip.dn}\n` +
      `🔢 ICCID: ${chip.icc}\n` +
      `📡 Compañía: ${chip.compania}\n` +
      `💰 Monto: $${monto}\n` +
      `🎯 Coincidencia: ${respApi.by}${reliabilityText}\n\n` +
      `🆔 *ID Ticket:* ${result.insertId}\n` +
      `⏳ *Estado:* Pendiente de procesamiento\n` +
      `⏱️ Tiempo estimado: 1-2 minutos\n\n` +
      `📅 Chip entregado: ${entregaFormato}`,
      messageId
    );

    const ticketId = result.insertId;

    // Emitir nueva recarga al front
    const io = getIO();

    io.emit("new-recharge", {
      id_ticketRecarga: ticketId,
      Numero: chip.dn,
      Monto: monto,
      Compania: chip.compania,
      Cliente: cliente.nombre_cliente,
      PrioridadCliente: 'ALTA',
      Distribuidor: cliente.nombre_distribuidor,
      Estado: "PENDIENTE",
    });

    iniciarTimerFolio(ticketId, 2);
    return ticketId;
  } catch (dbError) {
    console.error("❌ Error insertando ticket:", dbError);
    await sendWhatsAppMessage(from, "❌ Error guardando el ticket. Contacta al soporte técnico.", messageId);
    throw dbError;
  }
};
