import { Router } from "express";
import { callback } from "./authController.js";

const router = Router();

router.get("/callback", callback);

export default router;
