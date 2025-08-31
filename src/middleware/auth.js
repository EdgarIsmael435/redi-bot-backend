import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) return res.status(403).json({ error: "Token requerido" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Token inválido" });
    }
};
