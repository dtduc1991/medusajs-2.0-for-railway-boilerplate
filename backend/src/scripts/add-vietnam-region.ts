import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * One-off, idempotent update for a database that was already seeded before
 * `vn` was added to seed.ts's `countries` list. Re-running seed.ts itself
 * isn't safe here — `createRegionsWorkflow` unconditionally creates a new
 * region rather than upserting, so it would leave two "Europe" regions
 * instead of extending the existing one. Safe to run more than once: each
 * step is a no-op if `vn` is already present.
 *
 * Uses `regionModuleService.upsertRegions()` directly rather than
 * `updateRegionsWorkflow` — the workflow's step calls the plain
 * auto-generated `updateRegions(selector, data)`, which only touches the
 * Region entity's own columns. Reassigning a region's `countries` (a
 * hasMany to a shared country reference table) only happens in this
 * module's custom-overridden `create`/`upsertRegions` methods, confirmed by
 * reading `@medusajs/region`'s `region-module.js` — `updateRegions` silently
 * no-ops on `countries` since it isn't wired to that pipeline.
 */
export default async function addVietnamRegion({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const regionModuleService = container.resolve(Modules.REGION);
  const taxModuleService = container.resolve(Modules.TAX);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);

  const [region] = await regionModuleService.listRegions({}, { relations: ["countries"] });
  if (!region) {
    throw new Error("No region found — run seed.ts first.");
  }

  const existingCountries = region.countries?.map((c) => c.iso_2 as string) ?? [];
  if (!existingCountries.includes("vn")) {
    await regionModuleService.upsertRegions({
      id: region.id,
      name: region.name,
      currency_code: region.currency_code,
      countries: [...existingCountries, "vn"],
    });
    logger.info(`Added vn to region ${region.id}.`);
  } else {
    logger.info(`Region ${region.id} already includes vn.`);
  }

  const [existingTaxRegion] = await taxModuleService.listTaxRegions({ country_code: "vn" });
  if (!existingTaxRegion) {
    await taxModuleService.createTaxRegions({ country_code: "vn", provider_id: "tp_system" });
    logger.info("Created a vn tax region.");
  } else {
    logger.info("A vn tax region already exists.");
  }

  // `relations: ["geo_zones"]` is required here — without it, `geo_zones`
  // comes back undefined (not an empty array), which previously made the
  // `hasVn` check below always false and `updateServiceZones` (a full-replace
  // call) wipe out every other country's geo_zone on every run. Caught by
  // querying the DB directly after a run, not by reading code — the
  // `region.countries` case above has the same relation-loading shape, which
  // is what prompted checking this one too, but this one wasn't fixed on the
  // first pass and had already destroyed the other 7 geo_zones once before
  // this fix (recovered separately, see docs/sessions/014).
  const [serviceZone] = await fulfillmentModuleService.listServiceZones({}, { relations: ["geo_zones"] });
  if (!serviceZone) {
    throw new Error("No fulfillment service zone found — run seed.ts first.");
  }

  const hasVn = serviceZone.geo_zones?.some((gz) => gz.country_code === "vn");
  if (!hasVn) {
    await fulfillmentModuleService.updateServiceZones(serviceZone.id, {
      geo_zones: [
        ...(serviceZone.geo_zones ?? []).map((gz) => ({ country_code: gz.country_code, type: "country" as const })),
        { country_code: "vn", type: "country" as const },
      ],
    });
    logger.info(`Added vn geo_zone to service zone ${serviceZone.id}.`);
  } else {
    logger.info(`Service zone ${serviceZone.id} already includes vn.`);
  }
}
