import jwt from "jsonwebtoken";

export const verifyAndRefreshToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];
  if (!token) return res.status(403).json({ error: "Token requerido" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    const newToken = jwt.sign(
      {
        id: decoded.id,
        rol: decoded.rol,
      },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "2h" }
    );

    req.user = decoded;
    res.setHeader("x-new-token", newToken);

    next();
  } catch (err) {

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expirado" });
    }
    return res.status(401).json({ error: "Token inválido" });
  }
};
