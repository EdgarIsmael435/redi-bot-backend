import axios from "axios";
import fs from "fs";

const WHATSAPP_API_URL = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;

export const sendWhatsAppMessage = async (to, message) => {
  const data = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: message }
  };

  return axios.post(`${WHATSAPP_API_URL}/messages`, data, {
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
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
