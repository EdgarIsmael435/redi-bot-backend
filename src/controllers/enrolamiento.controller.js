import { consultarEnrolamiento } from "../services/enrolamiento.service.js";

const MAX_DNS = 50;
const TAM_LOTE = 5;

// Consulta de enrolamiento por DN (una línea o varias), sin tocar tickets
export const consultarDns = async (req, res) => {
  const { dns } = req.body || {};

  if (!Array.isArray(dns) || dns.length === 0) {
    return res.status(400).json({ success: false, error: "Se requiere un arreglo de DNs" });
  }
  if (dns.length > MAX_DNS) {
    return res.status(400).json({ success: false, error: `Máximo ${MAX_DNS} DNs por consulta` });
  }

  try {
    const resultados = [];

    for (let i = 0; i < dns.length; i += TAM_LOTE) {
      const lote = dns.slice(i, i + TAM_LOTE);
      const parcial = await Promise.all(
        lote.map(async (dnOriginal) => {
          const dn = String(dnOriginal ?? "").replace(/\D/g, "");
          if (dn.length !== 10) return { dn: String(dnOriginal ?? ""), enrolado: null, error: "DN inválido" };

          const enrolado = await consultarEnrolamiento(dn);
          return enrolado === null
            ? { dn, enrolado: null, error: "No se pudo verificar" }
            : { dn, enrolado };
        })
      );
      resultados.push(...parcial);
    }

    res.json({ success: true, data: resultados });
  } catch (err) {
    console.error("Error en consulta de enrolamiento:", err.message);
    res.status(500).json({ success: false, error: "Error al consultar enrolamiento" });
  }
};
