/**
 * Loyalty program economics, overridable via env so tuning them doesn't need a
 * code change (see docs/sessions/013's open item #4). Shared by the awarding
 * subscriber, the redemption route, and the public config route the
 * storefront reads before deciding what to show.
 */
export const POINTS_PER_CURRENCY_UNIT = Number(process.env.LOYALTY_POINTS_PER_CURRENCY_UNIT ?? 2);

/** Points required to redeem a free-drink reward; also the display cycle length. */
export const REWARD_THRESHOLD = Number(process.env.LOYALTY_REWARD_THRESHOLD ?? 8);
