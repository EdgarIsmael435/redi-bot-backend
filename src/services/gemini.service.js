import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const visionModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const imageToGeminiFormat = (imagePath) => {
    const imageBuffer = fs.readFileSync(imagePath);
    return {
        inlineData: {
            data: imageBuffer.toString("base64"),
            mimeType: "image/jpeg",
        },
    };
};

export const extractDataWithGemini = async (imagePath) => {
    const prompt = `Eres un experto en análisis de chips SIM mexicanos. 
  Analiza esta imagen paso a paso: 
  PASO 1: ORIENTACIÓN Y LIMPIEZA - Si la imagen está vertical u horizontal, identifica la orientación correcta del texto 
  - Analiza todos los números y texto visible 
  - Ignora reflejos, sombras o texto borroso 
  PASO 2: EXTRACCIÓN DE DATOS Busca específicamente estos elementos: 
  NÚMERO TELEFÓNICO: 
  - Busca números de 10 dígitos que empiecen con 55 o 56 (México) 
  - Pueden estar separados por espacios o guiones: "55-1234-5678" o "55 1234 5678" 
  - Pueden tener formato: "+52 55 1234 5678" (toma solo los 10 dígitos) 
  ICCID: 
  - Código de 19-20 dígitos que SIEMPRE empieza con "89" 
  - Formato típico: "8952000123456789012F" o "895200 012345 678901 2F" 
  - Puede estar dividido en bloques de 4-6 dígitos 
  - SIEMPRE termina en F MONTO: 
  - Busca cantidades precedidas por "$", "PESOS", "MXN" 
  - Valores comunes: 30, 50, 100, 150, 200, 300, 500 
  - Puede estar como "$100" o "100 PESOS" 
  COMPAÑÍA: 
  - Busca logos o nombres: TELCEL, AT&T, MOVISTAR, UNEFON, VIRGIN MOBILE 
  - Puede estar en esquinas o como marca de agua RESPONDE EXACTAMENTE en este formato JSON: 
  { 
  "numero": "solo 10 dígitos sin espacios ni guiones",
   "iccid": "19-20 dígitos empezando con 89, terminando en F", 
   "monto": "solo el número sin símbolo $", 
   "compania": "nombre de la compañía en MAYUSCULAS", 
   "confianza": "alta/media/baja", 
   "detalles_encontrados": "describe qué elementos pudiste ver claramente" 
   } 
   IMPORTANTE: Si no encuentras algún dato con certeza, pon "No encontrado". 
   Y tu confianza la vas a basar dependiendo la cantidad de datos encontrados NO inventes datos. Responde SOLO el JSON.`;

    const imageData = imageToGeminiFormat(imagePath);
    const result = await visionModel.generateContent([prompt, imageData]);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Gemini no devolvió JSON válido");

    return JSON.parse(jsonMatch[0]);
};
