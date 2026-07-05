import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { POINTS_PER_CURRENCY_UNIT, REWARD_THRESHOLD } from "../../../../modules/loyalty/config";

/** Public (no auth) so a guest's cart can show an accurate "Earns +N stars" estimate. */
export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  res.json({ pointsPerCurrencyUnit: POINTS_PER_CURRENCY_UNIT, rewardThreshold: REWARD_THRESHOLD });
};
