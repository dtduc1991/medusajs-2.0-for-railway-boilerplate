import { model } from "@medusajs/framework/utils";
import LoyaltyTransaction from "./loyalty-transaction";

const LoyaltyAccount = model.define("loyalty_account", {
  id: model.id().primaryKey(),
  customer_id: model.text().unique(),
  balance: model.number().default(0),
  transactions: model.hasMany(() => LoyaltyTransaction, { mappedBy: "account" }),
});

export default LoyaltyAccount;
