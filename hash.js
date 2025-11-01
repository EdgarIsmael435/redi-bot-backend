import bcrypt from "bcryptjs";

const generarHash = async () => {
  const password = "123"; // cámbialo por la contraseña que quieras
  const hash = await bcrypt.hash(password, 10);
  console.log("Password:", password);
  console.log("Hash:", hash);
};

generarHash();