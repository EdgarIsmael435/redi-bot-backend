import { Router } from "express";
import pool from "../config/db.js";

const router = Router();

// GET /api/companias
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM cat_Companias");
    res.json(rows);
  } catch (err) {
    console.error("❌ Error al obtener compañías:", err.message);
    res.status(500).json({ error: "Error al obtener compañías" });
  }
});

export default router;
