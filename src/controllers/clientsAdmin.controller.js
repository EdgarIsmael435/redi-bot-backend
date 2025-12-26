import { getAllClients, getClientById, createClient, updateClient, deleteClient, getMontosByClient, addMonto, deleteMonto, createBulkService } from "../services/clientAdmin.service.js";

export const getClients = async (req, res) => {
  try {
    const clients = await getAllClients();
    res.json(clients);
  } catch (error) {
    console.error("Error al obtener clientes:", error);
    res.status(500).json({ error: "Error al obtener clientes" });
  }
};

export const getClient = async (req, res) => {
  try {
    const client = await getClientById(req.params.id);
    if (!client) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json(client);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener cliente" });
  }
};

export const createNewClient = async (req, res) => {
  try {
    const client = await createClient(req.body);
    res.status(201).json(client);
  } catch (error) {
    console.error("Error al crear cliente:", error);
    res.status(500).json({ error: "Error al crear cliente" });
  }
};

export const updateClientData = async (req, res) => {
  try {
    const updated = await updateClient(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json({ message: "Cliente actualizado correctamente" });
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar cliente" });
  }
};

export const removeClient = async (req, res) => {
  try {
    const deleted = await deleteClient(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json({ message: "Cliente eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar cliente" });
  }
};

// Montos permitidos
export const getMontos = async (req, res) => {
  try {
    const montos = await getMontosByClient(req.params.id);
    res.json(montos);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener montos" });
  }
};

export const addMontoPermitido = async (req, res) => {
  try {
    const { monto } = req.body;
    const result = await addMonto(req.params.id, monto);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Error al agregar monto" });
  }
};

export const removeMontoPermitido = async (req, res) => {
  try {
    const result = await deleteMonto(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar monto" });
  }
};

export const createClientsBulk = async (req, res) => {
  try {
    const { clientes, prioridad, montos } = req.body;

    if (!clientes?.length) {
      return res.status(400).json({
        status: "error",
        message: "No se enviaron clientes",
      });
    }

    const result = await createBulkService({
      clientes,
      prioridad,
      montos,
    });

    res.json({
      status: "ok",
      inserted: result.inserted,
      skipped: result.skipped,
      message: result.message,
    });
  } catch (err) {
    console.error("Bulk insert error:", err);
    res.status(500).json({
      status: "error",
      message: "Error al cargar clientes",
    });
  }
};