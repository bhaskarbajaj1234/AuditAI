import { Router } from "express";
import { getMetrics } from "../controllers/metrics.controller.js";
import { postReview } from "../controllers/review.controller.js";
import { reviewLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.post("/review", reviewLimiter, postReview);
router.get("/metrics", getMetrics);

export default router;
