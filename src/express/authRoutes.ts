import { Router } from "express";
import type { RequestHandler } from "express";
import { callback } from "./authController.js";

const router = Router();

router.get("/callback", callback as RequestHandler);

export default router;
