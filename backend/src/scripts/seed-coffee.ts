import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import {
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";

/**
 * Seeds a coffee-shop catalog (products with Size x Milk variants) so the
 * `new-storefront` (Ember) design bundle has real backend data to render
 * instead of its `src/data.ts` mocks. Run `pnpm seed` first — this script
 * reuses the sales channel, shipping profile and stock location seed.ts
 * creates, and errors out if they don't exist yet.
 *
 * Usage: pnpm seed:coffee
 */

type Size = "Small" | "Medium" | "Large";
type Milk = "Oat" | "Whole" | "Almond" | "Lactose-free";

const SIZES: { size: Size; delta: number }[] = [
  { size: "Small", delta: -0.5 },
  { size: "Medium", delta: 0 },
  { size: "Large", delta: 0.6 },
];
const MILKS: Milk[] = ["Oat", "Whole", "Almond", "Lactose-free"];

const DRINKS = [
  {
    handle: "brown-sugar-oat-latte",
    title: "Brown Sugar Oat Latte",
    description: "Espresso, oat milk and slow-cooked brown sugar over ice.",
    category: "Espresso",
    basePrice: 5.75,
    sku: "BSOL",
  },
  {
    handle: "iced-cortado",
    title: "Iced Cortado",
    description: "Double shot, splash of milk.",
    category: "Espresso",
    basePrice: 4.25,
    sku: "CORT",
  },
  {
    handle: "pistachio-matcha",
    title: "Pistachio Matcha",
    description: "Stone-ground matcha, oat milk, pistachio.",
    category: "Matcha",
    basePrice: 6.25,
    sku: "PIMA",
  },
  {
    handle: "cold-brew-tonic",
    title: "Cold Brew Tonic",
    description: "18-hour cold brew over tonic and citrus.",
    category: "Cold",
    basePrice: 5.5,
    sku: "CBTO",
  },
];

const round2 = (n: number) => Math.round(n * 100) / 100;
const skuSuffix = (value: string) => value.toUpperCase().replace(/[^A-Z]/g, "");

export default async function seedCoffeeData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION);

  const [defaultSalesChannel] = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });
  if (!defaultSalesChannel) {
    throw new Error(
      "Default Sales Channel not found. Run `pnpm seed` before `pnpm seed:coffee`."
    );
  }

  const [shippingProfile] = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  if (!shippingProfile) {
    throw new Error(
      "Default shipping profile not found. Run `pnpm seed` before `pnpm seed:coffee`."
    );
  }

  const [stockLocation] = await stockLocationModuleService.listStockLocations({});
  if (!stockLocation) {
    throw new Error(
      "No stock location found. Run `pnpm seed` before `pnpm seed:coffee`."
    );
  }

  logger.info("Seeding coffee categories...");
  const categoryNames = Array.from(new Set(DRINKS.map((d) => d.category)));

  const { data: existingCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  });

  const missingCategoryNames = categoryNames.filter(
    (name) => !existingCategories.some((c: any) => c.name === name)
  );

  if (missingCategoryNames.length) {
    await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missingCategoryNames.map((name) => ({
          name,
          is_active: true,
        })),
      },
    });
  }

  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  });
  const categoryIdByName = new Map(categories.map((c: any) => [c.name, c.id]));

  logger.info("Seeding coffee products...");
  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  });
  const existingHandles = new Set(existingProducts.map((p: any) => p.handle));

  const productsToCreate = DRINKS.filter((d) => !existingHandles.has(d.handle)).map(
    (drink) => ({
      title: drink.title,
      category_ids: [categoryIdByName.get(drink.category)!],
      description: drink.description,
      handle: drink.handle,
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        { title: "Size", values: SIZES.map((s) => s.size) },
        { title: "Milk", values: MILKS },
      ],
      variants: SIZES.flatMap(({ size, delta }) =>
        MILKS.map((milk) => {
          const amount = round2(drink.basePrice + delta);
          return {
            title: `${size} / ${milk}`,
            sku: `COFFEE-${drink.sku}-${skuSuffix(size)}-${skuSuffix(milk)}`,
            options: { Size: size, Milk: milk },
            prices: [
              { amount, currency_code: "eur" },
              { amount, currency_code: "usd" },
            ],
          };
        })
      ),
      sales_channels: [{ id: defaultSalesChannel.id }],
    })
  );

  if (productsToCreate.length) {
    await createProductsWorkflow(container).run({
      input: { products: productsToCreate },
    });
  } else {
    logger.info("Coffee products already exist, skipping product creation.");
  }
  logger.info("Finished seeding coffee product data.");

  logger.info("Seeding coffee inventory levels...");
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku"],
  });
  const coffeeInventoryItems = inventoryItems.filter((item: any) =>
    item.sku?.startsWith("COFFEE-")
  );

  const { data: existingLevels } = await query.graph({
    entity: "inventory_level",
    fields: ["inventory_item_id", "location_id"],
  });
  const hasLevel = (itemId: string) =>
    existingLevels.some(
      (l: any) => l.inventory_item_id === itemId && l.location_id === stockLocation.id
    );

  const inventoryLevels = coffeeInventoryItems
    .filter((item: any) => !hasLevel(item.id))
    .map((item: any) => ({
      location_id: stockLocation.id,
      stocked_quantity: 1000000,
      inventory_item_id: item.id,
    }));

  if (inventoryLevels.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: inventoryLevels },
    });
  }

  logger.info("Finished seeding coffee data.");
}
