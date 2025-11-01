import { Router } from "express";
import { getTickets} from "../controllers/tickets.controller.js";

const router = Router();

router.get("/", getTickets);
/* router.post("/", createTicket); */

export default router;
