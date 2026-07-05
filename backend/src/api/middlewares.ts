import { authenticate, defineMiddlewares } from "@medusajs/framework/http";

export default defineMiddlewares({
  routes: [
    // `methods` is required here — without it, Medusa registers the middleware
    // via a plain Express `app.use(matcher, ...)` mount, which matches by path
    // *prefix* (so a bare "/store/loyalty" matcher would also catch
    // "/store/loyalty/config" and force auth on it too, which must stay public).
    {
      matcher: "/store/loyalty",
      methods: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/loyalty/redeem",
      methods: ["POST"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    // /store/loyalty/config is intentionally left public — see its route file.
  ],
});
