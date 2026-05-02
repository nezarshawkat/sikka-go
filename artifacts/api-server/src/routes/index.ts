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

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(sessionAuth);
router.use("/profile", profileRouter);
router.use("/transport-types", transportTypesRouter);
router.use("/transit-lines", transitLinesRouter);
router.use("/locations", locationsRouter);
router.use("/mawaqef", mawaqefRouter);
router.use("/reviews", reviewsRouter);
router.use("/trips/plan", tripPlanRouter);
router.use("/trips", tripsRouter);
router.use("/heatmaps", heatmapsRouter);
router.use("/analytics", analyticsRouter);
router.use("/admin/seed-cairo-transit", seedCairoTransitRouter);

export default router;
