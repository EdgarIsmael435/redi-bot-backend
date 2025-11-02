import http from "http";
import 'dotenv/config';
import app from "./src/app.js";
import { initSocket } from "./src/socket.js";

const PORT = process.env.PORT || 3000;

// Crear servidor HTTP basado en Express
const server = http.createServer(app);

// Inicializar socket.io sobre ese servidor
initSocket(server);

// Iniciar servidor
server.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
