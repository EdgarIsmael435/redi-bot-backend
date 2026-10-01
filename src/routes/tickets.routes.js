import { Router } from "express";
import { getTickets, getReporteTickets } from "../controllers/tickets.controller.js";
import { verifyAndRefreshToken } from "../middleware/auth.js";

const router = Router();

router.get("/", verifyAndRefreshToken, getTickets);
router.get("/reporte", verifyAndRefreshToken, getReporteTickets);

export default router;
