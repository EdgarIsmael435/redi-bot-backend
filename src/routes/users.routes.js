import express from "express";
import * as usersController from "../controllers/users.controller.js";
import { verifyAndRefreshToken } from "../middleware/auth.js";

const router = express.Router();

router.get("/", verifyAndRefreshToken, usersController.getUsers);
router.get("/:id", verifyAndRefreshToken, usersController.getUser);
router.post("/", verifyAndRefreshToken, usersController.createUser);
router.put("/:id", verifyAndRefreshToken, usersController.updateUser);
router.delete("/:id", verifyAndRefreshToken, usersController.deleteUser);

export default router;
