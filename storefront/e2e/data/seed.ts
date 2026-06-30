import axios, { AxiosError, AxiosInstance } from "axios"

axios.defaults.baseURL = process.env.CLIENT_SERVER || "http://localhost:9000"
axios.defaults.headers.common["x-publishable-api-key"] =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
let region = undefined as any

export async function seedData() {
  const axios = getOrInitAxios()
  return {
    user: await seedUser(),
  }
}

export async function seedUser(email?: string, password?: string) {
  const user = {
    first_name: "Test",
    last_name: "User",
    email: email || "test@example.com",
    password: password || "password",
  }
  try {
    const { data: authData } = await axios.post(
      "/auth/customer/emailpass/register",
      { email: user.email, password: user.password }
    )
    await axios.post(
      "/store/customers",
      { first_name: user.first_name, last_name: user.last_name, email: user.email },
      { headers: { Authorization: `Bearer ${authData.token}` } }
    )
    return user
  } catch (e: unknown) {
    if (e instanceof AxiosError) {
      if (e.response && e.response.status) {
        const status = e.response.status
        // customer or auth identity already exists
        if (status === 422 || status === 401) {
          return user
        }
      }
      throw e
    }
  }
}

async function loadRegion(axios: AxiosInstance) {
  const resp = await axios.get("/admin/regions")
  // This boilerplate's seed data only provisions a single (Europe/eur) region,
  // unlike medusa-starter-default which also seeds a us/usd region. Pick
  // whatever region actually exists rather than assuming "usd".
  region = resp.data.regions[0]
}

async function getOrInitAxios(axios?: AxiosInstance) {
  if (!axios) {
    axios = await loginAdmin()
  }
  if (!region) {
    await loadRegion(axios)
  }
  return axios
}

// Gift cards have no equivalent in the Medusa v2 Promotions module and the
// storefront's own cart code (src/lib/data/cart.ts) has gift card application
// commented out as unsupported. See docs/sessions/003-promotions-module-discount-specs.md.
export async function seedGiftcard(): Promise<never> {
  throw new Error(
    "Gift cards are not supported on Medusa v2 - see docs/sessions/003-promotions-module-discount-specs.md"
  )
}

export async function seedDiscount(axios?: AxiosInstance) {
  axios = await getOrInitAxios(axios)
  const code = "TEST_DISCOUNT_FIXED"
  // Products in this boilerplate's seed data are priced ~10-25 (eur, plain
  // currency units, not cents) - keep the fixed discount well under that so
  // it never gets capped at the cart subtotal server-side.
  const amount = 5

  // The test DB is only reset between full test files, not between
  // individual tests, and Medusa v2 rejects a duplicate promotion `code` -
  // delete any leftover promotion from a previous test in this file first
  // so repeated beforeEach calls stay idempotent.
  const existing = await axios.get("/admin/promotions", { params: { code } })
  for (const promotion of existing.data.promotions) {
    await axios.delete(`/admin/promotions/${promotion.id}`)
  }

  const resp = await axios.post("/admin/promotions", {
    code,
    type: "standard",
    status: "active",
    application_method: {
      type: "fixed",
      value: amount,
      currency_code: region.currency_code,
      target_type: "order",
    },
  })
  const promotion = resp.data.promotion
  return {
    id: promotion.id,
    code: promotion.code,
    rule_id: "",
    amount,
  }
}

async function loginAdmin() {
  const resp = await axios.post("/auth/user/emailpass", {
    email: process.env.MEDUSA_ADMIN_EMAIL || "admin@medusa-test.com",
    password: process.env.MEDUSA_ADMIN_PASSWORD || "supersecret",
  })
  if (resp.status !== 200) {
    throw { error: "must be able to log in user" }
  }
  return axios.create({
    headers: {
      Authorization: `Bearer ${resp.data.token}`,
    },
  })
}
