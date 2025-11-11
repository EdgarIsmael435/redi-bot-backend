import fs from "fs";
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
  PASO 0: CORRECCIÓN VISUAL
  - Si la imagen está invertida horizontal o verticalmente, o el texto está al revés, corrígelo mentalmente antes de leer.
  - Si el texto está rotado, gíralo mentalmente hasta que sea legible.
  - Considera que las tarjetas SIM mexicanas pueden venir en orientación espejo (impresas al revés).
  PASO 1: ORIENTACIÓN Y LIMPIEZA 
  - Si la imagen está vertical u horizontal, identifica la orientación correcta del texto 
  - Analiza todos los números y texto visible 
  - Ignora reflejos, sombras o texto borroso
  PASO 2: DETECCIÓN DE COMPAÑÍA  
  - Busca logos o palabras que identifiquen la compañía ("Telcel", "Amigo", "AT&T", "Unefon","Bait", "Virgin" "Movistar"):
  - Si pertenece claramente a Telcel y el numero de telefono NO comienza con 4, marca "validaRed": false.  
  - Si pertenece a otra compañía (AT&T, Unefon, Movistar, etc.), marca "validaRed": true.  
  - Si no hay forma de saberlo con certeza, deja "validaRed": false.  
  PASO 3: EXTRACCIÓN DE DATOS Busca específicamente estos elementos: 
  NÚMERO TELEFÓNICO: 
  - Busca números de 10 dígitos que empiecen con 55, 56 o 4 (México y Bajio) 
  - Pueden estar separados por espacios o guiones: "55-1234-5678", "55 1234 5678" o "4221234459"
  - Pueden tener formato: "+52 55 1234 5678" (toma solo los 10 dígitos) 
  - En caso de ser virgin, lo mas probable es que no venga el numero en el sim, si lo encuentras un mensaje similar a "Tu numero es: *seguido del número"
  ICCID: 
  - Código de 19-20 dígitos que SIEMPRE empieza con "89" 
  - Formato típico: "8952000123456789012F" o "895200 012345 678901 2F" 
  - Puede estar dividido en bloques de 4-6 dígitos 
  - Normalmente termina en F  
  { 
  "numero": "solo 10 dígitos sin espacios ni guiones",
   "iccid": "19-20 dígitos empezando con 89, terminando en F",
   "monto": null,
   "validaRed": "true o false dependiendo de la detección de compania",
   "detalles_encontrados": "Si la imagen no corresponde a un chip de RED, crea un mensaje amable, corto (máx. 20 palabras) y dirigido al cliente. \nDebe sonar natural y expresivo, como si estuvieras hablando con la persona (ejemplo: 'Qué bonito perro, me encanta 🐶'), evitando frases impersonales como 'Veo un perro gris bonito'. 
    Después del cumplido o comentario, agrega una nota amistosa como por ejemplo (con la misma idea, pero con otras similares para que no suene repetitivo): '(agregar un salto de line de programación \n) Pero parece que no es un chip de RED, intentemos con otra imagen 😅'. \nUsa un tono empático y positivo, con uno o dos emojis amigables. 
    No incluyas literalmente frases como 'Oops, te equivocaste, pero no pasa nada 😅'."
   } 
   IMPORTANTE: Si no encuentras algún dato con certeza, pon "No encontrado". 
   Y tu confianza la vas a basar dependiendo la cantidad de datos encontrados NO inventes datos. Responde SOLO el JSON.`;

    const imageData = imageToGeminiFormat(imagePath);
    const result = await visionModel.generateContent([prompt, imageData]);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    console.log(jsonMatch[0]);
    
    if (!jsonMatch) throw new Error("Gemini no devolvió JSON válido");

    return JSON.parse(jsonMatch[0]);
};
