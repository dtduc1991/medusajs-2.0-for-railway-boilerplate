import type { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { LOYALTY_MODULE } from "../modules/loyalty";
import type LoyaltyModuleService from "../modules/loyalty/service";
import { POINTS_PER_CURRENCY_UNIT } from "../modules/loyalty/config";

/**
 * Awards loyalty points on every placed order. The rate is configurable (see
 * modules/loyalty/config.ts) but defaults to matching the cosmetic
 * "Earns +N stars" estimate new-storefront's CartScreen shows pre-checkout
 * (also sourced from that same config via GET /store/loyalty/config), so the
 * number a customer saw keeps matching what they actually earn.
 */
export default async function awardLoyaltyPointsHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const loyaltyModuleService: LoyaltyModuleService = container.resolve(LOYALTY_MODULE);

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    filters: { id: data.id },
    fields: ["id", "customer_id", "total"],
  });

  if (!order?.customer_id) return;

  const pointsEarned = Math.round(order.total * POINTS_PER_CURRENCY_UNIT);
  if (pointsEarned <= 0) return;

  let [account] = await loyaltyModuleService.listLoyaltyAccounts({ customer_id: order.customer_id });
  if (!account) {
    account = await loyaltyModuleService.createLoyaltyAccounts({ customer_id: order.customer_id, balance: 0 });
  }

  await loyaltyModuleService.createLoyaltyTransactions({
    account_id: account.id,
    amount: pointsEarned,
    reason: "order.placed",
    reference_id: order.id,
  });
  await loyaltyModuleService.updateLoyaltyAccounts({ id: account.id, balance: account.balance + pointsEarned });
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
