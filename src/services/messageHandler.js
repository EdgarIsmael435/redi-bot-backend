import { clearSession } from "../utils/helpers.js";
import { isAmountAllowed } from "./client.service.js";
import { createTicket } from "./ticket.service.js";
import { sendWhatsAppMessage, sendQuickReplies, downloadMediaFile, sendStickerMessage } from "./whatsapp.service.js";
import { extractDataWithGemini } from "./gemini.service.js";
import { getChipData, releaseChip } from "./chip.service.js";
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
                    await sendQuickReplies(from, "¡Ups! 🥲\nEl monto elegido no es valido, puedes seleccionar uno de los siguientes montos:", quickReplies, message.id);
                } else {
                    await sendWhatsAppMessage(from, "⚠️ Escribe un monto válido (ejemplo: 50, 100, 200):", message.id);
                }
                return;
            }

            if (!isAmountAllowed(cliente, monto)) {
                if (cliente.montos_array?.length > 0) {
                    const montosTexto = cliente.montos_array.join("*, *$");
                    await sendWhatsAppMessage(from, `¡Ups! 🥲\nEl monto elegido no esta permitido.\nPuedes elegir una de las siguientes opciones: $*${montosTexto}*`, message.id);
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

    await sendWhatsAppMessage(
        from,
        `¡Hola, ${cliente.nombre_cliente}! 👋\n` +
        `Es un placer atender ${cliente.nombre_distribuidor}\n\n` +
        `📸 Envía la foto de tu SIM para procesar la recarga.`,
        message.id
    );

    await sendStickerMessage(from, STICKERS.bienvenida);
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
        console.log(`Ticket confirmado por botón: ${monto}`);
    } catch (err) {
        console.error("Error en botón:", err.message);
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
    let extracted = null;
    try {
        const activeSession = await redis.get(`session:${from}`);
        if (activeSession) {
            await sendWhatsAppMessage(from, "Estamos validando tu primera solicitud 🤖\nEn un momento podras solicitar un nuevo sim.", message.id);
            return;
        }

        await redis.set(`session:${from}`, JSON.stringify({ estado: "procesando_imagen" }), "EX", 300);

        await sendWhatsAppMessage(from, `Gracias, ${cliente.nombre_cliente} 😁\nHe recibido tu solicitud, voy a procesar tu imagen, dame un momento...`, message.id);

        await downloadMediaFile(mediaId, filePath);
        extracted = await extractDataWithGemini(filePath);

        if ((!extracted.iccid || extracted.iccid === "No encontrado") &&
            (!extracted.numero || extracted.numero === "No encontrado")) {
            await sendWhatsAppMessage(from, extracted.detalles_encontrados, message.id);
            await clearSession(from);
            return;
        }

        if (extracted.validaRed === false) {

            const chip = {
                id: null,
                icc: extracted.iccid,
                dn: extracted.numero,
                compania: 'TELCEL',
                entrega: '1999-02-27',
                folio: null,
                usuario: null,
                fecha: null,
                statusTkBot: null,
                fechaConsultaTkBot: null
            };

            const montoAuto = 100;
            await createTicket(from, cliente, chip, montoAuto, { status: "success", reliability: 100, by: "ICCID & DN" }, message.id);

            await clearSession(from);
            return;
        }

        // Consultar API
        let respApi;
        try {
            respApi = await getChipData(extracted.iccid || "", extracted.numero || "");
            console.log(respApi);
        } catch {
            await sendWhatsAppMessage(from, "Al parecer tengo un error en este momento 🥲\n¿Podriamos volver a comenzar con tu solicitud?.", message.id);
            try {
                if (extracted?.iccid || extracted?.numero) {
                    await releaseChip(extracted.iccid, extracted.numero);
                }
            } catch (apiErr) {
                console.error("Error liberando chip tras fallo:", apiErr.message);
            }
            await clearSession(from);
            return;
        }

        // Errores API
        if (respApi.status === "error") {
            if (respApi.blocked) {
                await sendWhatsAppMessage(
                    from,
                    `*Ya me compartiste este sim, en seguida obtendras respuesta de tu solicitud* 😅\n\n` +
                    `📅 Última consulta: ${respApi.lastConsulta}\n\n` +
                    `❌ No puedo volver a procesarlo, espera el folio de recarga.`,
                    message.id
                );
                await clearSession(from);
                return;
            }

            if (respApi.expired) {
                await sendWhatsAppMessage(
                    from,
                    `*Chip caducado* 🫣 \n\n` +
                    `Recuerda que tus sims cuentan con una fecha de caducidad\n` +
                    `Pero no te preocupes, puedes cambiar este sim con tu mayorista\n\n` +
                    `Te comparto los detalles de la recarga:\n` +
                    `📅 Fecha entrega: ${respApi.dateDelivery}\n` +
                    `⛔ Expiró: ${respApi.dateExpired}\n\n` +
                    `❌ No puedo procesar la recarga.`,
                    message.id
                );
                await clearSession(from);
                return;
            }

            if (respApi.used) {
                await sendWhatsAppMessage(
                    from,
                    `*Chip ya tiene recarga registrada* 🫣\n\n` +
                    `Recuerda que solo puedo hacer la primera recarga de un sim\n` +
                    `Te comparto los detalles de la recarga que yo o alguno de mis compañeros ya proceso:\n` +
                    `📅 Fecha recarga: ${respApi.data.fechaRecarga}\n` +
                    `📄 Folio: ${respApi.data.folio}\n\n` +
                    `❌ No puedo volver a recargar.`,
                    message.id
                );
                await clearSession(from);
                return;
            }

            await sendWhatsAppMessage(
                from,
                `*${respApi.message || 'Chip no encontrado'}* 🧐 \n\n` +
                `El chip no está registrado en nuestro inventario.\n` +
                `Si crees que es mi error, intenta con una imagen mas clara y asegurate de que se muestren todos los datos.🤖`,
                message.id
            );
            await clearSession(from);
            return;
        }


        // Chip válido
        const chip = respApi.data;
        console.log("CHIP:" + chip);

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
                await sendQuickReplies(from, `✅ Número detectado: ${chip.dn}\n💰 Ahora, selecciona un monto:`, quickReplies, message.id);
            } else {
                await sendWhatsAppMessage(from, `✅ Chip: ${chip.dn}\n💰 Escribe el monto (ej: 50, 100, 200):`, message.id);
            }
        }
    } catch (err) {
        console.error("Error procesando imagen:", err.message);
        await sendWhatsAppMessage(from, "No pude detectar informacion concreta 😟 \nIntenta de nuevo, si el error persiste, ponte en contacto con tu mayorita y reporta el error 😥.", message.id);
        try {
                if (extracted?.iccid || extracted?.numero) {
                    await releaseChip(extracted.iccid, extracted.numero);
                }
            } catch (apiErr) {
                console.error("Error liberando chip tras fallo:", apiErr.message);
            }
        await clearSession(from);
    } finally {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
};
