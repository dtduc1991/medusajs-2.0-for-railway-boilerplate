import crypto from "node:crypto";
import type { MedusaResponse } from "@medusajs/framework";
import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import type { IProductModuleService, IPromotionModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { LOYALTY_MODULE } from "../../../../modules/loyalty";
import type LoyaltyModuleService from "../../../../modules/loyalty/service";
import { REWARD_THRESHOLD } from "../../../../modules/loyalty/config";

/** Non-drink products live in this category (seed-coffee.ts) — excluded from the free-drink discount. */
const EXTRAS_CATEGORY_NAME = "Extras";

function generateRewardCode(): string {
  return `FREE-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

/**
 * Debits a redemption's worth of points (REWARD_THRESHOLD) and mints a real,
 * single-use Medusa promotion (100% off one non-Extras line item, `limit: 1`)
 * so the reward has real fulfillment behind it instead of a ledger-only entry
 * (see docs/sessions/013's "possible future work"). The code is handed back
 * to the caller, who applies it to the cart the same way any promo code is
 * applied (`sdk.store.cart.update(cartId, { promo_codes })`).
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

  const productModuleService: IProductModuleService = req.scope.resolve(Modules.PRODUCT);
  const [extrasCategory] = await productModuleService.listProductCategories({ name: EXTRAS_CATEGORY_NAME });

  const promotionModuleService: IPromotionModuleService = req.scope.resolve(Modules.PROMOTION);
  const promotion = await promotionModuleService.createPromotions({
    code: generateRewardCode(),
    type: "standard",
    status: "active",
    is_automatic: false,
    limit: 1,
    application_method: {
      type: "percentage",
      value: 100,
      target_type: "items",
      allocation: "each",
      max_quantity: 1,
      // Falls back to discounting any item if the Extras category doesn't exist
      // (e.g. a fresh DB before seed-coffee.ts has run) rather than failing outright.
      target_rules: extrasCategory
        ? [{ attribute: "items.product.categories.id", operator: "ne", values: [extrasCategory.id] }]
        : [],
    },
  });

  await loyaltyModuleService.createLoyaltyTransactions({
    account_id: account.id,
    amount: -REWARD_THRESHOLD,
    reason: "reward.redeemed",
    reference_id: promotion.code,
  });
  const updated = await loyaltyModuleService.updateLoyaltyAccounts({
    id: account.id,
    balance: account.balance - REWARD_THRESHOLD,
  });

  const transactions = await loyaltyModuleService.listLoyaltyTransactions(
    { account_id: account.id },
    { order: { id: "DESC" } }
  );

  res.json({ balance: updated.balance, transactions, code: promotion.code });
};
