import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { IAuthModuleService, ICustomerModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, generateJwtToken, Modules } from "@medusajs/framework/utils";

/**
 * Lets a customer log in with either their phone number or their email —
 * phone is the identifier actually registered with the `emailpass` provider
 * (see `new-storefront`'s signup flow), email is optional/supplementary. This
 * route never touches password hashing or auth-identity storage itself; it
 * only resolves whichever identifier was typed to the customer's real phone
 * number, then delegates to the same `emailpass` provider the core
 * `/auth/customer/emailpass` route uses, and mints a token the same way that
 * route does (`generateJwtToken`, the public primitive behind Medusa's own
 * `generateJwtTokenForAuthIdentity`).
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { identifier, password } = (req.body as { identifier?: unknown; password?: unknown }) ?? {};
  if (typeof identifier !== "string" || typeof password !== "string") {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  // `phone` isn't in the typed FilterableCustomerProps (only `email` is), even
  // though the Customer model has a plain, filterable `phone` column — cast
  // past the incomplete DTO type rather than fight it.
  const customerModuleService: ICustomerModuleService = req.scope.resolve(Modules.CUSTOMER);
  const [byPhone] = await customerModuleService.listCustomers({ phone: identifier } as any);
  const customer = byPhone ?? (await customerModuleService.listCustomers({ email: identifier }))[0];
  if (!customer?.phone) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const authModuleService: IAuthModuleService = req.scope.resolve(Modules.AUTH);
  const { success, authIdentity } = await authModuleService.authenticate("emailpass", {
    url: req.url,
    headers: req.headers,
    query: req.query,
    body: { email: customer.phone, password },
    protocol: req.protocol,
  } as any);

  if (!success || !authIdentity) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const config = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
  const { http } = config.projectConfig;
  const providerIdentity = authIdentity.provider_identities?.find((pi) => pi.provider === "emailpass");

  const token = generateJwtToken(
    {
      actor_id: authIdentity.app_metadata?.customer_id ?? "",
      actor_type: "customer",
      auth_identity_id: authIdentity.id,
      app_metadata: { customer_id: authIdentity.app_metadata?.customer_id },
      user_metadata: providerIdentity?.user_metadata ?? {},
    },
    {
      secret: http.jwtSecret,
      expiresIn: http.jwtExpiresIn,
      jwtOptions: http.jwtOptions,
    }
  );

  res.status(200).json({ token });
};
