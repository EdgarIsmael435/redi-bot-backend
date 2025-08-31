import { sendWhatsAppMessage, downloadMediaFile } from "../services/whatsapp.service.js";
import { extractDataWithGemini } from "../services/gemini.service.js";
import pool from "../config/db.js";
import fs from "fs";
import path from "path";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// GET /webhook → Verificación
export const verifyWebhook = (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ Webhook verificado correctamente");
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
};

// POST /webhook → Recepción de mensajes
export const receiveWebhook = async (req, res) => {
    try {
        const body = req.body;

        if (body.object === "whatsapp_business_account") {
            const entry = body.entry?.[0];
            const change = entry?.changes?.[0];

            if (change?.field === "messages") {
                const value = change.value;
                const message = value.messages?.[0];

                if (!message) {
                    console.log("⚠️ Webhook recibido sin mensajes (posiblemente status de entrega)");
                    return res.sendStatus(200);
                }

                const from = message.from;

                // 📝 Texto
                if (message.type === "text") {
                    await sendWhatsAppMessage(from, "👋 Envía la foto de tu SIM con el monto de recarga.");
                }

                // 🖼 Imagen
                if (message.type === "image") {
                    const mediaId = message.image.id;
                    const filePath = path.join("uploads", `sim_${Date.now()}.jpg`);

                    // Descargar imagen
                    await downloadMediaFile(mediaId, filePath);

                    // Analizar con Gemini
                    const extracted = await extractDataWithGemini(filePath);

                    console.log(`JSON OBTENIDO X GEMINI ${extracted}`);

                    // Buscar id_compania (si no existe, lo dejamos NULL)
                    let idCompania = 4;
                    if (extracted.compania) {
                        const [rows] = await pool.query(
                            "SELECT id_compania FROM cat_Companias WHERE UPPER(nombre) = UPPER(?)",
                            [extracted.compania.toLowerCase()]
                        );
                        if (rows.length > 0) {
                            idCompania = rows[0].id_compania;
                        }
                    } await pool.query(
                        `INSERT INTO tbl_TicketsRecarga 
                       (numero, iccid, monto, id_compania, id_estado, folio)
                        VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            extracted.numero || null,
                            extracted.iccid || null,
                            extracted.monto || 0,
                            idCompania, // 👈 siempre válido
                            1, // estado pendiente
                            null
                        ]
                    );

                    // Insertar ticket en DB
                    const [result] = await pool.query(
                        `INSERT INTO tbl_TicketsRecarga 
            (numero, iccid, monto, id_compania, id_estado, folio)
             VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            extracted.numero || null,
                            extracted.iccid || null,
                            extracted.monto || 0,
                            idCompania, // 👈 aquí se inserta null si no está en catálogo
                            1, // Estado "pendiente"
                            null
                        ]
                    );

                    console.log("💾 Ticket creado con ID:", result.insertId);

                    // Responder al cliente
                    await sendWhatsAppMessage(
                        from,
                        `🔍 *Datos detectados*\n\n📱 Número: ${extracted.numero}\n🔢 ICCID: ${extracted.iccid}\n💰 Monto: $${extracted.monto}\n📡 Compañía: ${extracted.compania}\n\n✅ Ticket registrado.`
                    );

                    // Eliminar archivo temporal
                    fs.unlinkSync(filePath);
                }
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error("❌ Error en webhook:", err.message);
        res.sendStatus(500);
    }
};
