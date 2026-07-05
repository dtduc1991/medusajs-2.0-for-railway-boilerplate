import { authenticate, defineMiddlewares } from "@medusajs/framework/http";

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/loyalty*",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
  ],
});
