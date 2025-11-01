import { handleTextMessage, handleInteractiveMessage, handleImageMessage } from "../services/messageHandler.js";
import { getClientData } from "../services/client.service.js";
import { sendWhatsAppMessage } from "../services/whatsapp.service.js";

export const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook verificado correctamente");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

export const receiveWebhook = async (req, res) => {
  try {
    const body = req.body;
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const cliente = await getClientData(from);

    if (!cliente) {
      await sendWhatsAppMessage(
        from,
        "❌ *Acceso no autorizado*\n\nTu número no está registrado en nuestro sistema.",
        message.id
      );
      return res.sendStatus(200);
    }

    if (message.type === "text") await handleTextMessage(from, message, cliente);
    if (message.type === "interactive") await handleInteractiveMessage(from, message, cliente);
    if (message.type === "image") await handleImageMessage(from, message, cliente);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error en webhook:", err.message);
    res.sendStatus(500);
  }
};
