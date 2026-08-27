import fs from "fs";
import path from "path";
import {
  ai,
  GEMINI_MODEL_MAYORISTA,
  GEMINI_BACKEND,
  MIME_BY_EXT,
  GeminiCallError,
} from "./genai.client.js";
import { log } from "console";

const NOT_FOUND = "No encontrado";

const prompt = `
Eres un sistema experto en análisis de tarjetas SIM mexicanas para inventario mayorista.

OBJETIVO:
Detectar TODOS los chips SIM visibles en la imagen.

REGLAS GENERALES:
- Analiza la imagen completa, incluso si hay varias tarjetas SIM.
- Examina cada tarjeta de forma individual y completa antes de pasar a la siguiente; no la descartes a la primera mirada.
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
- El ICCID casi siempre está impreso como texto (no solo como código de barras), normalmente debajo del código de barras. Ese texto puede ser pequeño, tener bajo contraste (por ejemplo texto oscuro sobre fondo oscuro o de color), o estar parcialmente tapado por el código de barras: revisa esa zona con especial cuidado antes de marcarlo como "No encontrado".

DETECCIÓN DE DN (opcional):
- Número telefónico de 10 dígitos.
- El diseño de la tarjeta (colores, fondo, tipografía) varía según la compañía; no asumas que un diseño con fondo oscuro o de color significa que el DN no está impreso.
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

const toGeminiImage = (imagePath) => {
  const ext = path.extname(imagePath).toLowerCase();
  return {
    inlineData: {
      mimeType: MIME_BY_EXT[ext] ?? "image/jpeg",
      data: fs.readFileSync(imagePath).toString("base64"),
    },
  };
};

// El ICCID lleva digito verificador Luhn. Validarlo descarta lecturas con
// digitos mal reconocidos sin comparar contra nada externo, que es el modo
// de fallo tipico de OCR sobre impresion pequena. Mas fiable que el campo
// confianza_icc autoreportado por el modelo.
const isValidIccid = (raw) => {
  if (typeof raw !== "string") return false;

  const clean = raw.replace(/[\s-]/g, "").toUpperCase().replace(/F$/, "");
  if (!/^89\d{16,18}$/.test(clean)) return false;

  let sum = 0;
  let double = clean.length % 2 === 0;

  for (const char of clean) {
    let digit = Number(char);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }

  return sum % 10 === 0;
};

const normalizeChip = (chip) => {
  const rawIccid = typeof chip?.iccid === "string" ? chip.iccid : "";
  const clean = rawIccid.replace(/[\s-]/g, "").toUpperCase();
  const valido = isValidIccid(rawIccid);

  return {
    iccid: valido ? clean : NOT_FOUND,
    iccidRaw: clean || null,
    iccidValido: valido,
    dn: /^\d{10}$/.test(chip?.dn ?? "") ? chip.dn : NOT_FOUND,
    confianzaIcc: Number(chip?.confianza_icc) || 0,
    confianzaDn: Number(chip?.confianza_dn) || 0,
  };
};

export const extractMayoristaChipsWithGemini = async (imagePath) => {
  let text;

  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL_MAYORISTA,
      contents: [{ text: prompt }, toGeminiImage(imagePath)],
      config: {
        thinkingConfig: { thinkingLevel: "high" },
        responseMimeType: "application/json",
      },
    });

    text = result.text;
    console.log(text);
  } catch (err) {
    console.error("Error al llamar a Gemini (mayorista)", {
      backend: GEMINI_BACKEND,
      model: GEMINI_MODEL_MAYORISTA,
      status: err?.status,
      message: err?.message,
    });
    throw new GeminiCallError("Fallo la llamada a Gemini para chips mayoristas", err);
  }

  let parsed;
  try {
    const match = text?.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch (err) {
    console.error("Respuesta no parseable de Gemini (mayorista):", text);
    throw new Error("Gemini devolvió un JSON malformado");
  }

  if (!Array.isArray(parsed?.chips)) {
    throw new Error("Formato inválido: chips no es arreglo");
  }

  const chips = parsed.chips.map(normalizeChip);

  // Se ignora total_detectados del modelo: si se contradice, gana el conteo real.
  return {
    chips,
    totalDetectados: chips.length,
    totalValidos: chips.filter((c) => c.iccidValido).length,
  };
};