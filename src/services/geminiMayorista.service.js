import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const visionModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash"
});

const imageToGeminiFormat = (imagePath) => {
  const imageBuffer = fs.readFileSync(imagePath);
  return {
    inlineData: {
      data: imageBuffer.toString("base64"),
      mimeType: "image/jpeg"
    }
  };
};

export const extractMayoristaChipsWithGemini = async (imagePath) => {
  const prompt = `
Eres un sistema experto en análisis de tarjetas SIM mexicanas para inventario mayorista.

OBJETIVO:
Detectar TODOS los chips SIM visibles en la imagen.

REGLAS GENERALES:
- Analiza la imagen completa, incluso si hay varias tarjetas SIM.
- Corrige mentalmente rotaciones, espejo o imagen invertida.
- Ignora texto borroso, reflejos o números incompletos.
- NO inventes datos.
- NO deduzcas datos por formato.
- Si un dato no es seguro, escribe "No encontrado".

DETECCIÓN DE ICCID:
- El ICCID es un número de 19 o 20 dígitos.
- SIEMPRE comienza con "89".
- Puede estar separado por espacios.
- Puede terminar en letra F.
- Devuelve SOLO números y letra F si existe.

DETECCIÓN DE DN (opcional):
- Número telefónico de 10 dígitos.
- Puede NO existir (por ejemplo en chips VIRGIN).

SALIDA OBLIGATORIA:
Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:

{
  "chips": [
    {
      "iccid": "string o 'No encontrado'",
      "dn": "string o 'No encontrado'",
      "confianza_icc": number entre 0 y 1,
      "confianza_dn": number entre 0 y 1
    }
  ],
  "total_detectados": number
}

IMPORTANTE:
- Si no detectas ningún chip, devuelve:
  {
    "chips": [],
    "total_detectados": 0
  }
- No incluyas texto fuera del JSON.
`;

  const imageData = imageToGeminiFormat(imagePath);
  const result = await visionModel.generateContent([prompt, imageData]);
  const response = await result.response;
  const text = response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  console.log(jsonMatch[0]);
  
  if (!jsonMatch) {
    throw new Error("Gemini no devolvió JSON válido para mayorista");
  }
  
  const parsed = JSON.parse(jsonMatch[0]);

  if (!Array.isArray(parsed.chips)) {
    throw new Error("Formato inválido: chips no es arreglo");
  }

  return parsed;
};
