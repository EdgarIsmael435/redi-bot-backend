import express from "express";
import * as usersController from "../controllers/clientsAdmin.controller.js";
import { verifyAndRefreshToken } from "../middleware/auth.js";

const router = express.Router();

router.get("/", verifyAndRefreshToken, usersController.getClients);
router.get("/:id", verifyAndRefreshToken, usersController.getClient);
router.post("/", verifyAndRefreshToken, usersController.createNewClient);
router.put("/:id", verifyAndRefreshToken, usersController.updateClientData);
router.delete("/:id", verifyAndRefreshToken, usersController.removeClient);
router.get("/:id/montos", verifyAndRefreshToken, usersController.getMontos);
router.post("/:id/montos", verifyAndRefreshToken, usersController.addMontoPermitido);
router.delete("/montos/:id", verifyAndRefreshToken, usersController.removeMontoPermitido);

export default router;
