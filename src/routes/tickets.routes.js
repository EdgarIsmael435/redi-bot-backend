import { Router } from "express";
import { getTickets, createTicket } from "../controllers/tickets.controller.js";

const router = Router();

// Listar tickets
router.get("/", getTickets);

// Crear ticket (ejemplo: cuando el bot confirma recarga)
router.post("/", createTicket);

export default router;
