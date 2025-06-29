import express from "express";
import { createNewRefreshToken, getMe, login } from "../Controllers/Auth/auth.js";

let AuthRouter = express.Router();

AuthRouter.post("/login", login)
.get("/refresh", createNewRefreshToken)
.get("/me", getMe)

export default AuthRouter