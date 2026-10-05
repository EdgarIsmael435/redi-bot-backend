import { Router } from "express";
import { consultarDns } from "../controllers/enrolamiento.controller.js";
import { verifyAndRefreshToken } from "../middleware/auth.js";

const router = Router();

router.post("/consulta", verifyAndRefreshToken, consultarDns);

export default router;
