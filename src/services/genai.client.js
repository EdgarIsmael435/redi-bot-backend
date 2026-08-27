import { GoogleGenAI } from "@google/genai";

const USE_VERTEX = process.env.GEMINI_BACKEND === "vertex";

// Cliente unico para todo el proyecto. Vertex enruta por endpoint regional
// y autentica por service account (GOOGLE_APPLICATION_CREDENTIALS), lo que
// elimina la dependencia de como Google geolocalice la IP del servidor.
// Se conserva la rama de API key como escape via variable de entorno.
export const ai = USE_VERTEX
  ? new GoogleGenAI({
      vertexai: true,
      project: process.env.GCP_PROJECT_ID,
      location: process.env.GCP_LOCATION ?? "global",
    })
  : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
export const GEMINI_BACKEND = USE_VERTEX ? "vertex" : "apikey";

export const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

// Error tipado para que el caller distinga fallo de infraestructura
// (no reintentar en caliente, degradar a zxing) de fallo de parseo.
export class GeminiCallError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "GeminiCallError";
    this.cause = cause;
    this.status = cause?.status;
  }
}