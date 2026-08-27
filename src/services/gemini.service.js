import fs from "fs";
import path from "path";
import {
  ai,
  GEMINI_MODEL,
  GEMINI_BACKEND,
  MIME_BY_EXT,
  GeminiCallError,
} from "./genai.client.js";

// WhatsApp no siempre entrega jpeg. Declarar mal el mimeType degrada la
// lectura sin lanzar error, que es el peor modo de fallo en un extractor.
const toGeminiImage = (imagePath) => {
  const ext = path.extname(imagePath).toLowerCase();
  return {
    inlineData: {
      mimeType: MIME_BY_EXT[ext] ?? "image/jpeg",
      data: fs.readFileSync(imagePath).toString("base64"),
    },
  };
};

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
  - Busca EXCLUSIVAMENTE palabras o logos explícitos de operador: "Telcel", "Amigo", "AT&T", "Unefon", "Bait", "Virgin", "Movistar".
  - NO infieras la compañía por el formato del número, prefijos, tipo de SIM o experiencia previa.
  - La marca "RED" NO es un operador móvil, es un distribuidor. Si SOLO aparece "RED" y ningún operador, considera que la compañía es DESCONOCIDA.
    REGLAS DE VALIDACIÓN:
    CASO 1: Si aparece explícitamente "Telcel" en la imagen
        - Y el número telefónico NO comienza con 4: Entonces "validaRed" debe ser false.
        - Y el número telefónico SÍ comienza con 4: Entonces "validaRed" debe ser true.
    CASO 2: Si aparece explícitamente cualquier otro operador (AT&T, Unefon, Movistar, Virgin, Bait):
        - Entonces "validaRed" debe ser true.
    CASO 3: Si NO aparece ningún operador explícito en la imagen:
        - Entonces "validaRed" debe ser true. 
  PASO 3: EXTRACCIÓN DE DATOS Busca específicamente estos elementos: 
  NÚMERO TELEFÓNICO: 
  - Busca números de 10 dígitos que empiecen con 55, 56, 2, 7, 4 (México y Bajio) 
  - Pueden estar separados por espacios o guiones: "55-1234-5678", "55 1234 5678", "4221234459", "2483638270" O "7724896350"
  - Pueden tener formato: "+52 55 1234 5678" (toma solo los 10 dígitos) 
  - En caso de ser virgin, lo mas probable es que no venga el numero en el sim, si lo encuentras sera en un mensaje similar a "Tu numero es: *seguido del número"
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
   "detalles_encontrados": "Si la imagen no corresponde a un chip de RED o numero e iccid (ambas) estan como "No encontrado", crea un mensaje amable, corto (máx. 20 palabras) y dirigido al cliente. \nDebe sonar natural y expresivo, como si estuvieras hablando con la persona (ejemplo: 'Qué bonito perro, me encanta 🐶'), evitando frases impersonales como 'Veo un perro gris bonito'. 
    Después del cumplido o comentario, agrega una nota amistosa como por ejemplo (con la misma idea, pero con otras similares para que no suene repetitivo): '(agregar un salto de line de programación \n) Pero parece que no es un chip de RED, intentemos con otra imagen 😅'. \nUsa un tono empático y positivo, con uno o dos emojis amigables. 
    No incluyas literalmente frases como 'Oops, te equivocaste, pero no pasa nada 😅', Si la imagen si corresponde, deja una breve descripción"
   } 
   IMPORTANTE: Si no encuentras algún dato con certeza, pon "No encontrado". 
   Y tu confianza la vas a basar dependiendo la cantidad de datos encontrados NO inventes datos.
   Responde SOLO con UN objeto JSON, nunca con un arreglo. Si la imagen contiene
   varios chips, analiza únicamente el más grande o centrado y menciona en
   "detalles_encontrados" que se detectaron varios y que envíe una foto de uno solo.`;

export const extractDataWithGemini = async (imagePath) => {
  let text;

  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ text: prompt }, toGeminiImage(imagePath)],
      config: {
        thinkingConfig: { thinkingLevel: "high" },
        responseMimeType: "application/json",
      },
    });

    text = result.text;
  } catch (err) {
    // Conservar status y mensaje original: perder esos campos fue lo que
    // hizo opaco el diagnostico del FAILED_PRECONDITION en produccion.
    console.error("Error al llamar a Gemini", {
      backend: GEMINI_BACKEND,
      model: GEMINI_MODEL,
      status: err?.status,
      message: err?.message,
    });
    throw new GeminiCallError("Fallo la llamada a Gemini para extracción de datos", err);
  }

  // responseMimeType ya garantiza JSON, el regex solo cubre preambulos.
  // Se parsea el texto completo primero: recortar entre la primera y la
  // ultima llave rompe cuando el modelo devuelve un arreglo de chips.
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text?.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!match) {
      console.error("Respuesta cruda de Gemini sin JSON detectable:", text);
      throw new Error("Gemini no devolvió JSON válido");
    }
    try {
      parsed = JSON.parse(match[0]);
    } catch (err) {
      console.error("JSON malformado recibido:", match[0]);
      throw new Error("Gemini devolvió un JSON malformado");
    }
  }

  // Red de seguridad: si el modelo ignora la instruccion y devuelve arreglo,
  // se toma el primer chip en lugar de tirar el mensaje del usuario.
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new Error("Gemini no detectó ningún chip");
    }
    console.warn("Gemini devolvió arreglo, se usa el primer elemento");
    return parsed[0];
  }

  return parsed;
};