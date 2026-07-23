import axios from "axios";

const CHIP_API_GET_URL = process.env.CLIENT_API_URL_GET_DATA_CHIP;
const CHIP_API_UPDATE_URL = process.env.CLIENT_API_URL_UPDATE_CHIP;
const CHIP_API_REVERT_DATA_SIM = process.env.CHIP_API_REVERT_DATA_SIM;
const CHIP_API_VALIDATE_MAYORISTA = process.env.CLIENT_API_URL_VALIDATE_MAYORISTA;
const MAYORISTA_API_BUSCAR_CLIENTES = process.env.CLIENT_API_URL_MAYORISTA_BUSCAR_CLIENTES;
const MAYORISTA_API_ASIGNAR_VENDEDOR = process.env.CLIENT_API_URL_MAYORISTA_ASIGNAR_VENDEDOR;
const CHIP_API_TOKEN = process.env.CHIP_API_TOKEN;

/*RECARGAS*/

/**
 * Consulta chip en el backend Laravel
 */
export const getChipData = async (iccid, dn) => {
  try {
    const url = `${CHIP_API_GET_URL}?ICCID=${encodeURIComponent(iccid)}&DN=${encodeURIComponent(dn)}`;
    const { data } = await axios.get(url, { timeout: 10000, validateStatus: () => true });
    return data;
  } catch (error) {
    console.error("Error consultando chip:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Actualiza chip en el backend Laravel (POST /chip/update)
 */
export const updateChipRecharge = async (chipData) => {
  try {
    const { data } = await axios.post(CHIP_API_UPDATE_URL, chipData, {
      headers: {
        "X-CHIP-TOKEN": CHIP_API_TOKEN,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
    return data;
  } catch (error) {
    console.error("Error actualizando chip:", error.response?.data || error.message);
    throw error;
  }
};

/**
 * Libera un chip consultado (revertir-consulta)
 */
export const releaseChip = async (iccid, dn) => {
  try {
    const url = `${CHIP_API_REVERT_DATA_SIM}`;

    const { data } = await axios.post(
      url,
      { iccid: iccid || null, dn: dn || null },
      {
        headers: {
          "X-CHIP-TOKEN": CHIP_API_TOKEN,
          "Content-Type": "application/json",
        },
        timeout: 8000,
        validateStatus: () => true,
      }
    );

    console.log(`Chip liberado (${iccid || dn}):`, data.status);
    return data;
  } catch (error) {
    console.error("Error liberando chip:", error.response?.data || error.message);
    throw error;
  }
};

/*MAYORISTAS*/
/**
 * Valida chip para flujo mayorista
 * Se puede validar por ICC o por DN
 */
export const validateChipMayorista = async ({
  icc = null,
  dn = null,
  codigo_mayorista,
}) => {
  try {
    const params = new URLSearchParams();

    params.append("codigo_mayorista", codigo_mayorista);

    if (icc) {
      params.append("icc", icc);
    } else {
      params.append("icc", "NA");
    }

    if (dn) {
      params.append("dn", dn);
    } else {
      params.append("dn", "NA");
    }

    const url = `${CHIP_API_VALIDATE_MAYORISTA}?${params.toString()}`;
    console.log(url);
    const { data } = await axios.get(url, {
      timeout: 10000,
      validateStatus: () => true,
    });

    return data;
  } catch (error) {
    console.error(
      "Error validando chip mayorista:",
      error.response?.data || error.message
    );
    throw error;
  }
};
/**
 * Buscar clientes por mayorista
 */
export const buscarClientesMayorista = async ({
  search,
  codigo_mayorista,
}) => {
  try {
    const params = new URLSearchParams();
    params.append("search", search);
    params.append("codigo_mayorista", codigo_mayorista);

    const url = `${MAYORISTA_API_BUSCAR_CLIENTES}?${params.toString()}`;

    const { data } = await axios.get(url, {
      timeout: 10000,
      validateStatus: () => true,
    });

    if (data.status !== "success") {
      return [];
    }

    return data.data || [];
  } catch (error) {
    console.error(
      "Error buscando clientes mayorista:",
      error.response?.data || error.message
    );
    throw error;
  }
};
/**
 * Asignar vendedor a un chip (flujo mayorista)
 */
export const asignarVendedorMayorista = async ({
  icc,
  id_cliente,
  codigo_mayorista,
  reasignar = false,
}) => {
  try {
    const payload = {
      icc,
      id_cliente,
      codigo_mayorista,
      reasignar,
    };

    const { data } = await axios.post(
      MAYORISTA_API_ASIGNAR_VENDEDOR,
      payload,
      {
        headers: {
          "X-CHIP-TOKEN": CHIP_API_TOKEN,
          "Content-Type": "application/json",
        },
        timeout: 10000,
        validateStatus: () => true,
      }
    );

    if (data.status !== "success") {
      throw new Error(
        data.message || data.code || "ERROR_ASIGNAR_VENDEDOR"
      );
    }

    return data;
  } catch (error) {
    console.error(
      "Error asignando vendedor mayorista:",
      error.response?.data || error.message
    );
    throw error;
  }
};