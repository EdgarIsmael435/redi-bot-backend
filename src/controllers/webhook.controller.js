import { handleTextMessage, handleInteractiveMessage, handleImageMessage } from "../services/messageHandler.js";
import { handleMayoristaImage, handleMayoristaText, handleMayoristaInteractive } from "../services/mayoristaHandler.js"
import { getClientData } from "../services/client.service.js";
import { getMayoristaData } from "../services/mayorista.service.js";
import redis from "../config/redis.js";

export const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("Webhook verificado correctamente");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

// Evita procesar dos veces el mismo mensaje (Meta reintenta la entrega del webhook)
const esMensajeNuevo = async (messageId) => {
  try {
    const ok = await redis.set(`wamsg:${messageId}`, "1", "EX", 60 * 60 * 24, "NX");
    return ok === "OK";
  } catch (err) {
    // Si Redis falla, mejor procesar que perder el mensaje
    console.error("Error verificando mensaje duplicado:", err.message);
    return true;
  }
};

export const receiveWebhook = async (req, res) => {
  // Responder a Meta de inmediato: si tarda (p. ej. Gemini), Meta reintenta
  // y el mismo mensaje se procesa dos veces
  res.sendStatus(200);

  try {
    const body = req.body;
    const value = body.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    // Meta acepta el envío (200) pero avisa aquí si la entrega falló después
    const failed = value?.statuses?.filter((s) => s.status === "failed") ?? [];
    failed.forEach((s) => {
      console.error("Entrega fallida WhatsApp:", {
        to: s.recipient_id,
        messageId: s.id,
        errors: s.errors,
      });
    });

    if (!message) return;

    if (!(await esMensajeNuevo(message.id))) {
      console.log("Mensaje duplicado ignorado: " + message.id);
      return;
    }

    console.log(message);

    const from = message.from;


    // 1. Intentar como cliente
    const cliente = await getClientData(from);

    if (cliente) {
      console.log("Conversación iniciada por CLIENTE: " + from);
      if (message.type === "text") {
        await handleTextMessage(from, message, cliente);
      }
      if (message.type === "interactive") {
        await handleInteractiveMessage(from, message, cliente);
      }
      if (message.type === "image") {
        await handleImageMessage(from, message, cliente);
      }
      return;
    }

    // 2. Intentar como mayorista
    const mayorista = await getMayoristaData(from);

    if (mayorista) {
      console.log("Conversación iniciada por MAYORISTA: " + from);
      if (message.type === "text") {
        await handleMayoristaText(from, message, mayorista);
      }
      if (message.type === "interactive") {
        await handleMayoristaInteractive(from, message, mayorista);
      }
      if (message.type === "image") {
        await handleMayoristaImage(from, message, mayorista);
      }
      return;
    }

    // 3. No autorizado: no se responde (cada mensaje de servicio se cobra)
    console.log("Mensaje ignorado de número no registrado: " + from);

  } catch (err) {
    console.error("Error en webhook:", err.message);
  }
};
