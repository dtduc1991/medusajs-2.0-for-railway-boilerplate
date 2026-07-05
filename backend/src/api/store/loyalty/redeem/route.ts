import type { MedusaResponse } from "@medusajs/framework";
import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { LOYALTY_MODULE } from "../../../../modules/loyalty";
import type LoyaltyModuleService from "../../../../modules/loyalty/service";
import { REWARD_THRESHOLD } from "../../../../modules/loyalty/config";

/**
 * Debits a redemption's worth of points (REWARD_THRESHOLD) from the
 * authenticated customer's account for a free-drink reward. This is the first
 * debit this ledger has ever produced — award-loyalty-points.ts only credits.
 * No custom fulfillment/coupon is created here; matches the original mock's
 * cosmetic-only "Free drink redeemed" activity row (see docs/sessions/013's
 * open item #3) — recording the ledger entry is the whole feature.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const customerId = req.auth_context.actor_id;
  const loyaltyModuleService: LoyaltyModuleService = req.scope.resolve(LOYALTY_MODULE);

  const [account] = await loyaltyModuleService.listLoyaltyAccounts({ customer_id: customerId });
  if (!account || account.balance < REWARD_THRESHOLD) {
    res.status(400).json({
      message: `Not enough points to redeem — need ${REWARD_THRESHOLD}, have ${account?.balance ?? 0}.`,
    });
    return;
  }

  await loyaltyModuleService.createLoyaltyTransactions({
    account_id: account.id,
    amount: -REWARD_THRESHOLD,
    reason: "reward.redeemed",
    reference_id: null,
  });
  const updated = await loyaltyModuleService.updateLoyaltyAccounts({
    id: account.id,
    balance: account.balance - REWARD_THRESHOLD,
  });

  const transactions = await loyaltyModuleService.listLoyaltyTransactions(
    { account_id: account.id },
    { order: { id: "DESC" } }
  );

  res.json({ balance: updated.balance, transactions });
};
