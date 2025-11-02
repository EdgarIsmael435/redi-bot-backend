import mysql from "mysql2/promise";

const testConnection = async () => {
  try {
    const connection = await mysql.createConnection({
      host: "206.189.200.236",
      user: "redi",
      password: "ATh-8KHb9byLD",
      database: "chatBotRedi",
    });

    const [rows] = await connection.query("SHOW TABLES;");
    console.log("✅ Conectado correctamente a MySQL");
    console.log("Tablas encontradas:");
    console.log(rows);

    await connection.end();
  } catch (err) {
    console.error("❌ Error de conexión:", err.message);
  }
};

testConnection();
