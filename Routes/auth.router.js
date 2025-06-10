import express from "express";
import { createNewRefreshToken, login } from "../Controllers/Auth/auth.js";

let AuthRouter = express.Router();

AuthRouter.post("/login", login)
.get("/refresh", createNewRefreshToken)

export default AuthRouter