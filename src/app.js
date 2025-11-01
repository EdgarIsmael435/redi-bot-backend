import express from "express";
import cors from "cors";
/* import ticketsRoutes from "./routes/tickets.routes.js";
import companiasRoutes from "./routes/companias.routes.js"; */
import authRoutes from "./routes/auth.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import usersRoutes from "./routes/users.routes.js";
import clientsRoutes from "./routes/clientsAdmins.routes.js";

const app = express();

// Middlewares
app.use(cors({
  origin: "*",
  exposedHeaders: ["x-new-token"],
}));
app.use(express.json());

// Rutas API
/* app.use("/api/tickets", ticketsRoutes);
app.use("/api/companias", companiasRoutes); */
app.use("/api/auth", authRoutes);
app.use("/api/usuarios", usersRoutes);
app.use("/api/clients", clientsRoutes);

app.use("/webhook", webhookRoutes);

// Endpoint de salud
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

export default app;
