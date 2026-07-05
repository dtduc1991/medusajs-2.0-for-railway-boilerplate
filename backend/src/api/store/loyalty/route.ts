import type { MedusaResponse } from "@medusajs/framework";
import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { LOYALTY_MODULE } from "../../../modules/loyalty";
import type LoyaltyModuleService from "../../../modules/loyalty/service";

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const customerId = req.auth_context.actor_id;
  const loyaltyModuleService: LoyaltyModuleService = req.scope.resolve(LOYALTY_MODULE);

  const [account] = await loyaltyModuleService.listLoyaltyAccounts({ customer_id: customerId });
  if (!account) {
    res.json({ balance: 0, transactions: [] });
    return;
  }

  const transactions = await loyaltyModuleService.listLoyaltyTransactions(
    { account_id: account.id },
    { order: { id: "DESC" } }
  );

  res.json({ balance: account.balance, transactions });
};
