import axios from "axios";

const CHIP_API_GET_URL = process.env.CLIENT_API_URL_GET_DATA_CHIP;
const CHIP_API_UPDATE_URL = process.env.CLIENT_API_URL_UPDATE_CHIP;
const CHIP_API_TOKEN = process.env.CHIP_API_TOKEN;

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
      timeout: 8000,
    });
    return data;
  } catch (error) {
    console.error("Error actualizando chip:", error.response?.data || error.message);
    throw error;
  }
};
