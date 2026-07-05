import type { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { LOYALTY_MODULE } from "../modules/loyalty";
import type LoyaltyModuleService from "../modules/loyalty/service";

/**
 * Awards loyalty points on every placed order. The rate (2 points per unit of
 * currency) matches the cosmetic "Earns +N stars" estimate new-storefront's
 * CartScreen already showed before this ledger existed, so the number a
 * customer saw pre-checkout keeps matching what they actually earn.
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

  const pointsEarned = Math.round(order.total * 2);
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
