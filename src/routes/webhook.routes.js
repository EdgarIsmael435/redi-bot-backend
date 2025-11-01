import { Router } from "express";
import { verifyWebhook, receiveWebhook } from "../controllers/webhook.controller.js";

const router = Router();

router.get("/", verifyWebhook);
router.post("/", receiveWebhook);

export default router;
