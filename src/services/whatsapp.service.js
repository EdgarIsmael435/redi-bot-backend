import axios from "axios";
import fs from "fs";

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

export const sendQuickReplies = async (to, text, quickReplies, replyToMessageId = null) => {
  try {
    const messagePayload = {
      messaging_product: "whatsapp",
      to: to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: text
        },
        action: {
          buttons: quickReplies.slice(0, 3) // WhatsApp permite máximo 3 botones
        }
      }
    };

    // Si es respuesta a un mensaje específico
    if (replyToMessageId) {
      messagePayload.context = {
        message_id: replyToMessageId
      };
    }

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      messagePayload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("✅ Quick replies enviados:", response.data);
    return response.data;

  } catch (error) {
    console.error("❌ Error enviando quick replies:", error.response?.data || error.message);
    throw error;
  }
};

export const sendWhatsAppMessage = async (to, message, replyToMessageId = null) => {
  const cleanNumber = to.replace("whatsapp:", "").replace("+", "");

  const data = {
    messaging_product: "whatsapp",
    to: cleanNumber,
    type: "text",
    text: { body: message }
  };

  //Responder sobre un mensaje anterior
  if (replyToMessageId) {
    data.context = { message_id: replyToMessageId };
  }

  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      data,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Mensaje enviado correctamente");
    return response.data;
  } catch (error) {
    console.error("❌ Error enviando mensaje:", error.response?.data || error.message);
    throw error;
  }
};

export const downloadMediaFile = async (mediaId, outputPath) => {
  const urlResp = await axios.get(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });
  const mediaUrl = urlResp.data.url;

  const fileResp = await axios.get(mediaUrl, {
    responseType: "stream",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);
    fileResp.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
};

export const sendStickerMessage = async (to, stickerId, replyToMessageId = null) => {
  try {
    const cleanNumber = to.replace("whatsapp:", "").replace("+", "");

    const payload = {
      messaging_product: "whatsapp",
      to: cleanNumber,
      type: "sticker",
      sticker: { id: stickerId },
    };

    if (replyToMessageId) {
      payload.context = { message_id: replyToMessageId };
    }

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Sticker enviado correctamente a ${cleanNumber}`);
    return response.data;

  } catch (error) {
    console.error("❌ Error enviando sticker:", error.response?.data || error.message);
    throw error;
  }
};
