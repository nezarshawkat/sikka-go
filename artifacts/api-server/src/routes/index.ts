import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import transportTypesRouter from "./transportTypes";
import transitLinesRouter from "./transitLines";
import locationsRouter from "./locations";
import mawaqefRouter from "./mawaqef";
import reviewsRouter from "./reviews";
import tripsRouter from "./trips";
import heatmapsRouter from "./heatmaps";
import analyticsRouter from "./analytics";
import tripPlanRouter from "./tripPlan";
import seedCairoTransitRouter from "./seedCairoTransit";
import { sessionAuth } from "../middlewares/sessionAuth";

const router: IRouter = Router();

// Public — no auth needed
router.use(healthRouter);
router.use("/auth", authRouter);

// Populate req.userId from Bearer token on all remaining routes
router.use(sessionAuth);

// Resources: auth enforcement is applied per-method inside each router file
router.use("/transport-types", transportTypesRouter);
router.use("/transit-lines", transitLinesRouter);
router.use("/locations", locationsRouter);
router.use("/mawaqef", mawaqefRouter);
router.use("/heatmaps", heatmapsRouter);
router.use("/reviews", reviewsRouter);
router.use("/analytics", analyticsRouter);
router.use("/admin/seed-cairo-transit", seedCairoTransitRouter);

// User-scoped routes
router.use("/profile", profileRouter);
router.use("/trips/plan", tripPlanRouter);
router.use("/trips", tripsRouter);

export default router;
