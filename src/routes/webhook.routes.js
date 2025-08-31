import { Router } from "express";
import { verifyWebhook, receiveWebhook } from "../controllers/webhook.controller.js";

const router = Router();

// Verificación inicial del webhook (GET)
router.get("/", verifyWebhook);

// Recepción de mensajes (POST)
router.post("/", receiveWebhook);

export default router;
