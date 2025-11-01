import { clearSession } from "../utils/helpers.js";
import { isAmountAllowed } from "./client.service.js";
import { createTicket } from "./ticket.service.js";
import { sendWhatsAppMessage, sendQuickReplies, downloadMediaFile, sendStickerMessage } from "./whatsapp.service.js";
import { extractDataWithGemini } from "./gemini.service.js";
import {getChipData} from "./chip.service.js";
import redis from "../config/redis.js";
import fs from "fs";
import path from "path";
import { STICKERS } from "../constants/stickers.js";

//Extraer monto de texto libre
const extractAmountFromText = (text) => {
    if (!text || typeof text !== "string") return null;

    const patterns = [
        /\b(20|30|50|100|150|200|300|500|1000)\b/g,
        /\$\s?(\d{2,4})/g,
        /(\d{2,4})\s?(peso|pesos)/gi,
        /recarga\s?de\s?(\d{2,4})/gi,
        /(\d{2,4})\s?mxn/gi,
    ];

    for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
            const amount = matches[0].replace(/\D/g, "");
            const numAmount = parseInt(amount);
            if (numAmount >= 20 && numAmount <= 1000) return numAmount.toString();
        }
    }
    return null;
};

//Quick replies
const generateQuickReplies = (montosArray) =>
    montosArray.map((monto) => ({
        type: "reply",
        reply: { id: `monto_${monto}`, title: `$${monto}` },
    }));

// =========================================================
// Handler: mensajes de TEXTO
// =========================================================
export const handleTextMessage = async (from, message, cliente) => {
    const text = message.text.body.trim();
    const sessionData = await redis.get(`session:${from}`);

    if (sessionData) {
        const session = JSON.parse(sessionData);

        if (session.estado === "esperando_monto") {
            let monto = extractAmountFromText(text);

            if (!monto) {
                if (cliente.montos_array?.length > 0) {
                    const quickReplies = generateQuickReplies(cliente.montos_array);
                    await sendQuickReplies(from, "⚠️ Selecciona un monto válido:", quickReplies, message.id);
                } else {
                    await sendWhatsAppMessage(from, "⚠️ Escribe un monto válido (ejemplo: 50, 100, 200):", message.id);
                }
                return;
            }

            if (!isAmountAllowed(cliente, monto)) {
                if (cliente.montos_array?.length > 0) {
                    const montosTexto = cliente.montos_array.join(", $");
                    await sendWhatsAppMessage(from, `⚠️ Monto no permitido.\n💰 Opciones: $${montosTexto}`, message.id);
                } else {
                    await sendWhatsAppMessage(from, `⚠️ Monto no válido. Escribe entre $20 y $1000:`, message.id);
                }
                return;
            }

            await createTicket(from, cliente, session.chip, monto, session, message.id);
            await clearSession(from);
            return;
        }
    }
    
    await sendStickerMessage(from, STICKERS.bienvenida);

    await sendWhatsAppMessage(
        from,
        `¡Hola ${cliente.nombre_cliente} 👋\n`+
        `Es un placer atender 🏪 ${cliente.nombre_distribuidor}! \n\n` +
        `📸 Envía la foto de tu SIM para procesar la recarga.`,
        message.id
    );
};

// =========================================================
// Handler: mensajes INTERACTIVOS (Quick Replies)
// =========================================================
export const handleInteractiveMessage = async (from, message, cliente) => {
    try {
        const replyId = message.interactive?.button_reply?.id;

        if (!replyId?.startsWith("monto_")) {
            await sendWhatsAppMessage(from, "⚠️ Respuesta no válida.", message.id);
            return;
        }

        const sessionData = await redis.get(`session:${from}`);
        if (!sessionData) {
            await sendWhatsAppMessage(from, "⚠️ No tienes recarga pendiente.", message.id);
            return;
        }

        const session = JSON.parse(sessionData);
        if (!session.chip) {
            await clearSession(from);
            await sendWhatsAppMessage(from, "⚠️ Sesión inválida. Inicia de nuevo.", message.id);
            return;
        }

        const monto = replyId.replace("monto_", "").trim();
        if (!monto || isNaN(Number(monto))) {
            await sendWhatsAppMessage(from, "⚠️ Monto inválido.", message.id);
            return;
        }

        if (!isAmountAllowed(cliente, monto)) {
            await sendWhatsAppMessage(from, `⚠️ El monto $${monto} no está permitido.`, message.id);
            return;
        }

        await createTicket(from, cliente, session.chip, monto, session, message.id);
        await clearSession(from);
        console.log(`✅ Ticket confirmado por botón: ${monto}`);
    } catch (err) {
        console.error("❌ Error en botón:", err.message);
        await clearSession(from);
        await sendWhatsAppMessage(from, "⚠️ Ocurrió un error. Intenta de nuevo.", message.id);
    }
};

// =========================================================
// Handler: mensajes con IMAGEN
// =========================================================
export const handleImageMessage = async (from, message, cliente) => {
    const mediaId = message.image.id;
    const filePath = path.join("uploads", `sim_${Date.now()}.jpg`);

    try {
        const activeSession = await redis.get(`session:${from}`);
        if (activeSession) {
            await sendWhatsAppMessage(from, "Estamos validando tu primera solicitud 🤖\nEn un momento podras solicitar un nuevo sim.", message.id);            
            return;
        }

        await redis.set(`session:${from}`, JSON.stringify({ estado: "procesando_imagen" }), "EX", 300);

        await sendWhatsAppMessage(from, `⏳ Procesando tu imagen, ${cliente.nombre_cliente}...`, message.id);
        sendStickerMessage(from, STICKERS.proceso)
        
        await downloadMediaFile(mediaId, filePath);
        const extracted = await extractDataWithGemini(filePath);

        if (extracted.confianza === "baja") {
            await sendWhatsAppMessage(from, "❌ Imagen no clara. Envía otra foto del SIM.", message.id);
            await clearSession(from);
            return;
        }

        if ((!extracted.iccid || extracted.iccid === "No encontrado") &&
            (!extracted.numero || extracted.numero === "No encontrado")) {
            await sendWhatsAppMessage(from, "❌ No se detectaron datos en la imagen.", message.id);
            await clearSession(from);
            return;
        }

        // Consultar API
        let respApi;
        try {
            respApi = await getChipData(extracted.iccid || "", extracted.numero || "");
            console.log(respApi);
            
        } catch {
            await sendWhatsAppMessage(from, "❌ Error consultando el sistema.", message.id);
            await clearSession(from);
            return;
        }

        // Errores API
        if (respApi.status === "error") {
            if (respApi.blocked) {
                await sendWhatsAppMessage(
                    from,
                    `⚠️ *Chip ya cuenta con un ticket en proceso*\n\n` +
                    `📅 Última consulta: ${respApi.lastConsulta}\n\n` +
                    `❌ No se puede volver a procesar, espera el folio de recarga.`,
                    message.id
                );
                await clearSession(from);
                return;
            }

            if (respApi.expired) {
                await sendWhatsAppMessage(
                    from,
                    `⚠️ *Chip caducado* (vigencia 30 días)\n\n` +
                    `📅 Fecha entrega: ${respApi.date_delivery}\n` +
                    `⛔ Expiró: ${respApi.dateExpired}\n\n` +
                    `❌ No se puede procesar la recarga.`,
                    message.id
                );
                await clearSession(from);
                return;
            }

            if (respApi.used) {
                await sendWhatsAppMessage(
                    from,
                    `⚠️ *Chip ya tiene recarga registrada*\n\n` +
                    `📅 Fecha recarga: ${respApi.data.fechaRecarga}\n` +
                    `📄 Folio: ${respApi.data.folio}\n\n` +
                    `❌ No se puede volver a recargar.`,
                    message.id
                );
                await clearSession(from);
                return;
            }

            await sendWhatsAppMessage(
                from,
                `❌ *${respApi.message || 'Chip no encontrado'}*\n\n` +
                `El chip no está registrado en el inventario.\n` +
                `Verifica los datos o contacta a tu distribuidor.`,
                message.id
            );
            await clearSession(from);
            return;
        }


        // Chip válido
        const chip = respApi.data;
        console.log(chip);
        
        const caption = message.image?.caption || "";
        const montoFromCaption = extractAmountFromText(caption);

        if (montoFromCaption && isAmountAllowed(cliente, montoFromCaption)) {
            await createTicket(from, cliente, chip, montoFromCaption, respApi, message.id);
            await clearSession(from);
        } else {
            await redis.set(
                `session:${from}`,
                JSON.stringify({
                    estado: "esperando_monto",
                    chip,
                    status: respApi.status,
                    reliability: respApi.reliability,
                    by: respApi.by,
                }),
                "EX",
                300
            );

            if (cliente.montos_array?.length > 0) {
                const quickReplies = generateQuickReplies(cliente.montos_array);
                await sendQuickReplies(from, `✅ Chip: ${chip.dn}\n💰 Selecciona monto:`, quickReplies, message.id);
            } else {
                await sendWhatsAppMessage(from, `✅ Chip: ${chip.dn}\n💰 Escribe el monto (ej: 50, 100, 200):`, message.id);
            }
        }
    } catch (err) {
        console.error("❌ Error procesando imagen:", err.message);
        await sendWhatsAppMessage(from, "❌ Hubo un error. Intenta de nuevo.", message.id);
        await clearSession(from);
    } finally {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
};
