import path from "path";
import crypto from "crypto";
import fs from "fs";
import redis from "../config/redis.js";
import { 
    sendWhatsAppMessage, 
    downloadMediaFile, 
    sendQuickReplies 
} from "./whatsapp.service.js";
import {
    createImagenProcesada,
    createChipDetectado,
    marcarChipDetectado
} from "./mayorista.repository.js";
import {
    validateChipMayorista,
    buscarClientesMayorista,
    asignarVendedorMayorista
} from "./chip.service.js";
import { extractMayoristaChipsWithGemini } from "./geminiMayorista.service.js";
import { saveSession, clearSession } from "../utils/helpers.js";

/* ======================================================
   Utils
====================================================== */
const generarHashImagen = (filePath) => {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
};

const normalizarRespuestaGemini = (v) => {
    if (v === undefined || v === null) return null;

    const raw = String(v).trim();
    if (!raw) return null;

    // Normaliza: minusculas, quita signos y deja solo letras, numeros y espacios
    const val = raw
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // Detectar casos comunes
    if (
        val === "no encontrado" ||
        val === "no detectado" ||
        val === "n a" ||
        val === "na" ||
        val === "n a" ||
        val === "sin dato" ||
        val === "ilegible"
    ) {
        return null;
    }

    // Si contiene la frase, tambien lo invalidamos
    if (val.includes("no encontrado") || val.includes("no detectado")) {
        return null;
    }

    return raw;
};

/* ======================================================
   Quick Replies Generators
====================================================== */
const generateSiNoReplies = () => {
    return [
        {
            type: "reply",
            reply: {
                id: "mayorista_si",
                title: "✅ Sí"
            }
        },
        {
            type: "reply",
            reply: {
                id: "mayorista_no",
                title: "❌ No"
            }
        }
    ];
};


/* ======================================================
   IMAGEN
====================================================== */
export const handleMayoristaImage = async (from, message, mayorista) => {
    const mediaId = message.image.id;
    const now = Date.now();
    const fileName = `mayorista_${from}_${now}.jpg`;
    const filePath = path.join("uploads/mayoristas", fileName);

    try {
        const activeSession = await redis.get(`session:mayorista:${from}`);

        if (activeSession) {
            await sendWhatsAppMessage(
                from,
                "⏳ Ya estoy procesando una solicitud. Espera un momento.",
                message.id
            );
            return;
        }

        await saveSession(`mayorista:${from}`, { estado: "procesando_imagen" });

        await sendWhatsAppMessage(
            from,
            `📸 Imagen recibida, ${mayorista.nombre_mayorista}\nEstoy analizando los SIMs, dame un momento…`,
            message.id
        );

        await downloadMediaFile(mediaId, filePath);
        const hashImagen = generarHashImagen(filePath);

        const extracted = await extractMayoristaChipsWithGemini(filePath);
        if (!extracted?.chips?.length) {
            await sendWhatsAppMessage(
                from,
                "😕 No logré detectar SIMs en la imagen. Intenta con una foto más clara.",
                message.id
            );
            await clearSession(`mayorista:${from}`);
            return;
        }

        const imagen = await createImagenProcesada({
            id_mayorista: mayorista.id_mayorista,
            path_imagen: filePath,
            hash_imagen: hashImagen,
            total_chips_detectados: extracted.chips.length
        });

        let chipsValidos = [];
        let chipsReasignables = [];
        let chipsInvalidos = [];

        for (const rawChip of extracted.chips) {
            const chip = {
                icc: normalizarRespuestaGemini(rawChip.iccid),
                dn: normalizarRespuestaGemini(rawChip.dn),
                confianza_icc: rawChip.confianza_icc,
                confianza_dn: rawChip.confianza_dn
            };

            const registro = await createChipDetectado({
                id_imagen: imagen.id_imagen,
                icc: chip.icc,
                dn: chip.dn,
                confianza_icc: chip.confianza_icc,
                confianza_dn: chip.confianza_dn
            });

            const chipId = registro.id_chip_detectado;
            let respApi;

            // Intentar validar el chip
            try {
                respApi = await validateChipMayorista({
                    icc: chip.icc,
                    dn: chip.dn,
                    codigo_mayorista: mayorista.codigo_mayorista
                });
            } catch (error) {
                // Si falla la petición y no hay datos, marcar como error
                if (!chip.icc && !chip.dn) {
                    await marcarChipDetectado(chipId, "ERROR", "SIN_DATOS");
                    chipsInvalidos.push({ icc: null, dn: null, motivo: "SIN_DATOS" });
                    continue;
                }
                // Si hay datos pero falló la API, marcamos error genérico
                await marcarChipDetectado(chipId, "ERROR", "ERROR_API");
                chipsInvalidos.push({ 
                    icc: chip.icc, 
                    dn: chip.dn, 
                    motivo: "ERROR_API" 
                });
                continue;
            }

            // CASO ESPECIAL: Chip ya asignado (viene con status=success desde PHP)
            if (respApi?.code === "CHIP_YA_ASIGNADO") {
                await marcarChipDetectado(
                    chipId,
                    "ASIGNADO",
                    respApi.message || "YA_ASIGNADO"
                );

                chipsReasignables.push({
                    chipId,
                    icc: chip.icc,
                    dn: chip.dn,
                    vendedor_actual: respApi.data?.vendedor || "DESCONOCIDO"
                });
                continue;
            }

            // ERRORES: status diferente de success
            if (!respApi || respApi.status !== "success") {
                let estado = "ERROR";
                let motivo = respApi?.message || "INVALIDO";

                // Clasificar el tipo de error
                switch (respApi?.code) {
                    case "CHIP_RECARGADO":
                        estado = "RECARGADO";
                        break;
                    case "CHIP_CADUCADO":
                        estado = "CADUCADO";
                        break;
                    case "CHIP_NO_EXISTE":
                    case "CHIP_NO_PERTENECE_MAYORISTA":
                    case "FECHA_ENTREGA_INVALIDA":
                    case "ICC_O_DN_REQUERIDO":
                        estado = "ERROR";
                        break;
                }

                await marcarChipDetectado(chipId, estado, motivo);
                chipsInvalidos.push({ icc: chip.icc, dn: chip.dn, motivo });
                continue;
            }

            // CHIP VÁLIDO
            await marcarChipDetectado(chipId, "VALIDO");
            chipsValidos.push({
                chipId,
                icc: respApi.data.icc,
                dn: respApi.data.dn
            });
        }

        /* ================= RESUMEN ================= */
        let resumen = `📊 *Resultado del análisis*\n\n`;
        resumen += `✅ SIMs disponibles: *${chipsValidos.length}*\n`;
        resumen += `🔁 SIMs reasignables: *${chipsReasignables.length}*\n`;
        resumen += `⛔ SIMs no válidos: *${chipsInvalidos.length}*\n\n`;

        if (chipsReasignables.length > 0) {
            resumen += `🔁 *SIMs ya asignados*\n`;
            chipsReasignables.slice(0, 5).forEach(c => {
                resumen += `• ICC ${c.icc}: ${c.vendedor_actual}\n`;
            });
            resumen += `\n¿Deseas *reasignarlos*?`;
            
            await saveSession(`mayorista:${from}`, {
                estado: "confirmar_reasignacion",
                chips_validos: chipsValidos,
                chips_reasignables: chipsReasignables
            });

            // Enviar Quick Replies en lugar de texto simple
            await sendQuickReplies(from, resumen, generateSiNoReplies(), message.id);
        } else if (chipsValidos.length > 0) {
            resumen += `✍️ Escribe el *nombre del cliente* para continuar.\n`;
            
            await saveSession(`mayorista:${from}`, {
                estado: "esperando_cliente",
                chips_validos: chipsValidos,
                chips_reasignables: chipsReasignables
            });

            await sendWhatsAppMessage(from, resumen, message.id);
        } else {
            // No hay chips válidos ni reasignables
            resumen += `\n❌ No hay SIMs disponibles para asignar.`;
            await sendWhatsAppMessage(from, resumen, message.id);
            await clearSession(`mayorista:${from}`);
            return;
        }

    } catch (err) {
        console.error("Error handleMayoristaImage:", err.message);
        await sendWhatsAppMessage(
            from,
            "❌ Ocurrió un error procesando la imagen. Intenta nuevamente.",
            message.id
        );
        await clearSession(`mayorista:${from}`);
    }
};

/* ======================================================
   TEXTO
====================================================== */
export const handleMayoristaText = async (from, message, mayorista) => {
    const sessionId = `mayorista:${from}`;
    const sessionKey = `session:${sessionId}`;
    const session = await redis.get(sessionKey);

    if (!session) {
        await sendWhatsAppMessage(
            from,
            `👋 ¡Hola, ${mayorista.nombre_mayorista}!\nEnvíame una *foto de los SIMs* para comenzar 📸`,
            message.id
        );
        return;
    }

    const data = JSON.parse(session);
    const texto = message.text?.body?.trim()?.toUpperCase();
    if (!texto) return;

    /* ============ CONFIRMAR REASIGNACION ============ */
    if (data.estado === "confirmar_reasignacion") {
        // Si el usuario responde con texto en vez de usar los botones
        await sendWhatsAppMessage(
            from, 
            "⚠️ Por favor usa los botones ✅ *Sí* o ❌ *No* para responder.", 
            message.id
        );
        return;
    }

    /* ============ ESPERANDO CLIENTE ============ */
    if (data.estado === "esperando_cliente") {
        const clientes = await buscarClientesMayorista({
            search: texto,
            codigo_mayorista: mayorista.codigo_mayorista
        });

        if (!clientes?.length) {
            await sendWhatsAppMessage(
                from, 
                "No encontré clientes con ese nombre. Intenta de nuevo.", 
                message.id
            );
            return;
        }

        // Un solo cliente encontrado
        if (clientes.length === 1) {
            const c = clientes[0];
            await saveSession(sessionId, {
                ...data,
                estado: "esperando_confirmacion",
                cliente_seleccionado: c
            });

            await sendQuickReplies(
                from,
                `🧾 Confirmar asignación a *${c.nombre} ${c.apellido}*\n¿Deseas continuar?`,
                generateSiNoReplies(),
                message.id
            );
            return;
        }

        // Múltiples clientes encontrados
        let msg = "Encontré varios clientes:\n\n";
        clientes.slice(0, 5).forEach((c, i) => {
            msg += `${i + 1}. ${c.nombre} ${c.apellido}\n`;
        });
        msg += "\nEscribe el número del cliente correcto.";

        await saveSession(sessionId, {
            ...data,
            estado: "seleccionando_cliente",
            clientes_encontrados: clientes
        });

        await sendWhatsAppMessage(from, msg, message.id);
        return;
    }

    /* ============ SELECCIONANDO CLIENTE ============ */
    if (data.estado === "seleccionando_cliente") {
        const num = parseInt(texto);
        
        if (isNaN(num) || num < 1 || num > data.clientes_encontrados.length) {
            await sendWhatsAppMessage(
                from, 
                `Número inválido. Escribe un número entre 1 y ${data.clientes_encontrados.length}`, 
                message.id
            );
            return;
        }

        const c = data.clientes_encontrados[num - 1];
        
        await saveSession(sessionId, {
            ...data,
            estado: "esperando_confirmacion",
            cliente_seleccionado: c
        });

        await sendQuickReplies(
            from,
            `🧾 Confirmar asignación a *${c.nombre} ${c.apellido}*\n¿Deseas continuar?`,
            generateSiNoReplies(),
            message.id
        );
        return;
    }

    /* ============ CONFIRMACION FINAL ============ */
    if (data.estado === "esperando_confirmacion") {
        // Si el usuario responde con texto en vez de usar los botones
        await sendWhatsAppMessage(
            from, 
            "⚠️ Por favor usa los botones ✅ *Sí* o ❌ *No* para responder.", 
            message.id
        );
        return;
    }

    // Estado no reconocido
    await sendWhatsAppMessage(
        from,
        "⚠️ Sesión en estado inválido. Envía una nueva imagen para comenzar.",
        message.id
    );
    await clearSession(sessionId);
};

/* ======================================================
   INTERACTIVE (Quick Replies)
====================================================== */
export const handleMayoristaInteractive = async (from, message, mayorista) => {
    try {
        const replyId = message.interactive?.button_reply?.id;
        const sessionId = `mayorista:${from}`;
        const sessionKey = `session:${sessionId}`;
        const session = await redis.get(sessionKey);

        if (!session) {
            await sendWhatsAppMessage(
                from,
                `👋 ¡Hola, ${mayorista.nombre_mayorista}!\nEnvíame una *foto de los SIMs* para comenzar 📸`,
                message.id
            );
            return;
        }

        const data = JSON.parse(session);

        /* ============ CONFIRMAR REASIGNACION ============ */
        if (data.estado === "confirmar_reasignacion") {
            if (replyId === "mayorista_si") {
                // Agregar chips reasignables a los válidos
                data.chips_validos = [
                    ...(data.chips_validos || []),
                    ...(data.chips_reasignables || [])
                ];

                await saveSession(sessionId, {
                    ...data,
                    estado: "esperando_cliente"
                });

                await sendWhatsAppMessage(
                    from,
                    "Perfecto 👍 Escribe el *nombre del cliente*.",
                    message.id
                );
                return;
            }

            if (replyId === "mayorista_no") {
                if (!data.chips_validos || data.chips_validos.length === 0) {
                    await sendWhatsAppMessage(
                        from,
                        "No hay SIMs disponibles para asignar. Operación cancelada.",
                        message.id
                    );
                    await clearSession(sessionId);
                    return;
                }

                await saveSession(sessionId, {
                    ...data,
                    estado: "esperando_cliente"
                });

                await sendWhatsAppMessage(
                    from,
                    "De acuerdo. Escribe el *nombre del cliente* para continuar.",
                    message.id
                );
                return;
            }

            await sendWhatsAppMessage(
                from,
                "⚠️ Respuesta no válida. Usa los botones para responder.",
                message.id
            );
            return;
        }

        /* ============ CONFIRMACION FINAL ============ */
        if (data.estado === "esperando_confirmacion") {
            if (replyId === "mayorista_no") {
                await clearSession(sessionId);
                await sendWhatsAppMessage(from, "❌ Operación cancelada.", message.id);
                return;
            }

            if (replyId === "mayorista_si") {
                // Proceder con la asignación
                let ok = 0;
                let fail = 0;

                const chipsReasignablesICCs = new Set(
                    (data.chips_reasignables || []).map(c => c.icc)
                );

                for (const chip of data.chips_validos) {
                    try {
                        const esReasignacion = chipsReasignablesICCs.has(chip.icc);
                        
                        await asignarVendedorMayorista({
                            icc: chip.icc,
                            id_cliente: data.cliente_seleccionado.id,
                            codigo_mayorista: mayorista.codigo_mayorista,
                            reasignar: esReasignacion
                        });
                        ok++;
                    } catch (error) {
                        console.error(`Error asignando chip ${chip.icc}:`, error.message);
                        fail++;
                    }
                }

                await sendWhatsAppMessage(
                    from,
                    `✅ Asignación completada\n\n✔️ Exitosas: ${ok}\n❌ Fallidas: ${fail}`,
                    message.id
                );

                await clearSession(sessionId);
                return;
            }

            await sendWhatsAppMessage(
                from,
                "⚠️ Respuesta no válida. Usa los botones para responder.",
                message.id
            );
            return;
        }

        // Estado no reconocido
        await sendWhatsAppMessage(
            from,
            "⚠️ Sesión en estado inválido. Envía una nueva imagen para comenzar.",
            message.id
        );
        await clearSession(sessionId);

    } catch (err) {
        console.error("Error en handleMayoristaInteractive:", err.message);
        await clearSession(`mayorista:${from}`);
        await sendWhatsAppMessage(
            from,
            "⚠️ Ocurrió un error. Intenta de nuevo.",
            message.id
        );
    }
};