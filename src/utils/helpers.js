import redis from "../config/redis.js";
//export const formatPhone = (num) => num.replace(/\D/g, "").slice(-10);
// Limpia la sesión de un cliente en Redis
export const clearSession = async (from) => {
  try {
    const key = `session:${from}`;
    const backupKey = `expired_backup:${key}`;

    await redis.del(key);
    await redis.del(backupKey);

    console.log(`Sesión eliminada para ${from} (incluyendo backup)`);
  } catch (err) {
    console.error("Error limpiando sesión:", err.message);
  }
};


export const saveSession = async (from, data, ttl = 900) => {
    const key = `session:${from}`;
    const backupKey = `expired_backup:${key}`;

    // Sesión normal
    await redis.set(key, JSON.stringify(data), "EX", ttl);

    // Backup con 30s más
    await redis.set(backupKey, JSON.stringify(data), "EX", ttl + 30);

    return true;
};
