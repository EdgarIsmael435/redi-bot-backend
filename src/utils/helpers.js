import redis from "../config/redis.js";
export const formatPhone = (num) => num.replace(/\D/g, "").slice(-10);
// Limpia la sesión de un cliente en Redis
export const clearSession = async (from) => {
  try {
    await redis.del(`session:${from}`);
    console.log(`🗑️ Sesión eliminada para ${from}`);
  } catch (err) {
    console.error("⚠️ Error limpiando sesión:", err.message);
  }
};
