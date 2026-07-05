import { model } from "@medusajs/framework/utils";
import LoyaltyAccount from "./loyalty-account";

const LoyaltyTransaction = model.define("loyalty_transaction", {
  id: model.id().primaryKey(),
  amount: model.number(),
  reason: model.text(),
  reference_id: model.text().nullable(),
  account: model.belongsTo(() => LoyaltyAccount, { mappedBy: "transactions" }),
});

export default LoyaltyTransaction;
