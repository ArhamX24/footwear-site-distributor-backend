// routes/auth.router.js
import express from "express";
import { login, createNewRefreshToken, getMe, logout } from "../Controllers/Auth/auth.js";
import authenticateToken from "../MIddlewares/auth.middleware.js";

const AuthRouter = express.Router();

// ✅ Universal login route
AuthRouter.post("/login", login);
AuthRouter.get("/refresh", createNewRefreshToken);
AuthRouter.get("/me", authenticateToken, getMe);
AuthRouter.post("/logout", authenticateToken, logout);

export default AuthRouter;
