import redis from "./redis.js";
import { releaseChip } from "../services/chip.service.js";
import { sendWhatsAppMessage } from "../services/whatsapp.service.js";

const sub = redis.duplicate();

// Esperar conexión
sub.on("ready", () => {
    console.log("Redis subscriber conectado (ioredis)");
});

// Suscripción
sub.subscribe("__keyevent@0__:expired", (err) => {
    if (err) return console.error("❌ Error suscribiendo:", err);
    console.log("Suscrito a eventos de expiración");
});

// Evento recibido
sub.on("message", async (channel, key) => {
    if (channel !== "__keyevent@0__:expired") return;
    if (!key.startsWith("session:")) return;

    console.log(`Expiró sesión: ${key}`);

    const from = key.replace("session:", "");
    const backupKey = `expired_backup:${key}`;
    const raw = await redis.get(backupKey);

    if (!raw) {
        console.log("Backup no encontrado → Nada que liberar.");
        return;
    }

    try {
        const session = JSON.parse(raw);
        await sendWhatsAppMessage(
            from,
            "*Se agotó el tiempo de proceso* 😅\n\n" +
            "Tu solicitud quedó incompleta y por seguridad se liberó el SIM.\n\n" +
            "📸 *Por favor envía de nuevo la foto del SIM* para comenzar el proceso otra vez."
        );
        if (session?.chip?.icc || session?.chip?.dn) {
            await releaseChip(session.chip.icc, session.chip.dn);
            console.log(`SIM liberado automáticamente: ${session.chip.icc} / ${session.chip.dn}`);
        } else {
            console.log("No había chip en la sesión.");
        }

        await redis.del(backupKey);
    } catch (err) {
        console.error("Error procesando expiración:", err.message);
    }
});
