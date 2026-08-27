import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_TEST_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
    }
  }
});

try {
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Di solamente OK"
  });

  console.log("RESPUESTA:", result.text);
} catch (error) {
  console.error("ERROR:", error);
}