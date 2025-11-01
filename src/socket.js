import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import pool from "./config/db.js";
import { asignarFolio } from "./services/ticket.service.js";

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      console.warn("Conexión rechazada: token no proporcionado");
      return next(new Error("Token requerido"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      console.log(`Usuario autenticado vía socket:`, decoded);
      next();
    } catch (err) {
      console.warn("Token inválido o expirado en socket:", err.message);
      next(new Error("Token inválido o expirado"));
    }
  });

  io.on("connection", async (socket) => {
    console.log(`Cliente conectado: ${socket.id} (Usuario ID: ${socket.user?.id})`);

    try {
      const [rows] = await pool.query(`
        SELECT 
          tk.id_ticketRecarga AS id_ticketRecarga,
          es.descripcion AS Estado,
          tk.nombre_compania AS Compania,
          tk.monto AS Monto,
          tk.numero AS Numero,
          tk.folio AS Folio,
          tk.folioAuto AS FolioAuto,        
          tk.fechaRegistro AS FechaSolicitud,
          dir.nombre_cliente AS Cliente,
          dir.nombre_distribuidor AS Distribuidor,
          pr.descripcion AS PrioridadCliente
        FROM chatbotred.tbl_TicketsRecarga tk
        INNER JOIN chatbotred.cat_estados es ON tk.id_estado = es.id_estado
        INNER JOIN chatbotred.tbl_DirectorioClientes dir ON tk.id_cliente = dir.id_cliente 
        INNER JOIN chatbotred.cat_prioridadCliente pr ON dir.id_prioridadCliente = pr.id_prioridadCliente
      `);

      socket.emit("recharges", rows);
    } catch (err) {
      console.error("Error cargando tickets iniciales:", err.message);
    }

    socket.on("process-recharge", async (data) => {
      try {
        const { ticketId, folio, esFolioFalso, nombreOperador } = data;
        console.log(`Operador ${socket.user?.id} procesó:`, data);

        const ok = await asignarFolio(ticketId, folio, 2, esFolioFalso, nombreOperador);

        if (ok) {
          const [updated] = await pool.query(
            `SELECT 
              tk.id_ticketRecarga AS id_ticketRecarga,
              es.descripcion AS Estado,
              tk.nombre_compania AS Compania,
              tk.monto AS Monto,
              tk.numero AS Numero,
              tk.folio AS Folio,
              tk.fechaRegistro AS FechaSolicitud,
              dir.nombre_cliente AS Cliente,
              dir.nombre_distribuidor AS Distribuidor,
              pr.descripcion AS PrioridadCliente
            FROM chatbotred.tbl_TicketsRecarga tk
            INNER JOIN chatbotred.cat_estados es ON tk.id_estado = es.id_estado
            INNER JOIN chatbotred.tbl_DirectorioClientes dir ON tk.id_cliente = dir.id_cliente 
            INNER JOIN chatbotred.cat_prioridadCliente pr ON dir.id_prioridadCliente = pr.id_prioridadCliente
            WHERE tk.id_ticketRecarga = ?`,
            [ticketId]
          );

          if (updated.length > 0) {
            io.emit("recharge-updated", updated[0]);
          }
        }
      } catch (err) {
        console.error("Error en process-recharge:", err.message);
      }
    });

    socket.on("disconnect", () => {
      console.log(`Cliente desconectado: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io no ha sido inicializado.");
  return io;
};
