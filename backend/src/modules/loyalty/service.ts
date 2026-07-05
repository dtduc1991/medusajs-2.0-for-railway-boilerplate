import { MedusaService } from "@medusajs/framework/utils";
import LoyaltyAccount from "./models/loyalty-account";
import LoyaltyTransaction from "./models/loyalty-transaction";

class LoyaltyModuleService extends MedusaService({
  LoyaltyAccount,
  LoyaltyTransaction,
}) {}

export default LoyaltyModuleService;
