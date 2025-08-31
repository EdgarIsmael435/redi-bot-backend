import express from "express";
import bodyParser from "body-parser";
import ticketsRoutes from "./routes/tickets.routes.js";
import companiasRoutes from "./routes/companias.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";

const app = express();

app.use(bodyParser.json());

// Rutas API
app.use("/api/tickets", ticketsRoutes);
app.use("/api/companias", companiasRoutes);
app.use("/webhook", webhookRoutes);

// Endpoint de salud
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

export default app;
