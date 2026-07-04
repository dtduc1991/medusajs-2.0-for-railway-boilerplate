import { useState } from 'react';
import { theme } from '../theme';
import { Icon } from '../components/Icon';
import { money } from '../data';
import { getRegionId, retrieveCart } from '../lib/backend';
import { listShippingOptions, placeOrder, setCheckoutAddress, setShippingMethod, type CheckoutAddress, type ShippingOption } from '../lib/checkout';
import type { Cart } from '../lib/backend';

// Only the countries backend/src/scripts/seed.ts actually maps to a shipping
// service zone can resolve shipping options — not an arbitrary UI restriction.
const COUNTRIES: { code: string; label: string }[] = [
  { code: 'gb', label: 'United Kingdom' },
  { code: 'de', label: 'Germany' },
  { code: 'dk', label: 'Denmark' },
  { code: 'se', label: 'Sweden' },
  { code: 'fr', label: 'France' },
  { code: 'es', label: 'Spain' },
  { code: 'it', label: 'Italy' },
];

interface CheckoutScreenProps {
  cart: Cart;
  onBack: () => void;
  onPlaced: (orderId: string, displayId: number) => void;
}

export function CheckoutScreen({ cart, onBack, onPlaced }: CheckoutScreenProps) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address1, setAddress1] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [countryCode, setCountryCode] = useState(COUNTRIES[0].code);

  const [shippingOptions, setShippingOptions] = useState<ShippingOption[] | null>(null);
  const [shippingOptionId, setShippingOptionId] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selectingShipping, setSelectingShipping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reflects the cart total including tax + the selected shipping method,
  // refetched from the backend after each shipping method change (rather than
  // computed client-side) so the amount shown always matches what will
  // actually be charged.
  const [total, setTotal] = useState(cart.total);

  // Shipping options depend on the cart's shipping address (country → service
  // zone), so they're only fetched once an address has been set on the cart.
  const loadShippingOptions = async () => {
    setLoadingOptions(true);
    setError(null);
    try {
      const address: CheckoutAddress = {
        first_name: firstName,
        last_name: lastName,
        address_1: address1,
        city,
        postal_code: postalCode,
        country_code: countryCode,
      };
      await setCheckoutAddress(cart.id, address, email);
      const options = await listShippingOptions(cart.id);
      setShippingOptions(options);
      if (options[0]) await selectShippingOption(options[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingOptions(false);
    }
  };

  // Selecting a delivery method commits it to the cart immediately (matching
  // storefront/'s real checkout behavior) so the displayed total always
  // reflects what completing the cart will actually charge.
  const selectShippingOption = async (optionId: string) => {
    setSelectingShipping(true);
    setError(null);
    try {
      await setShippingMethod(cart.id, optionId);
      setShippingOptionId(optionId);
      const updated = await retrieveCart();
      if (updated) setTotal(updated.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSelectingShipping(false);
    }
  };

  const canReview = email && firstName && lastName && address1 && city && postalCode;

  const handlePlaceOrder = async () => {
    if (!shippingOptionId) return;
    setSubmitting(true);
    setError(null);
    try {
      const regionId = await getRegionId();
      const order = await placeOrder(cart.id, regionId);
      onPlaced(order.id, order.display_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 22px 10px' }}>
        <button onClick={onBack} style={circleBtn}>
          <Icon name="ArrowLeft" size={19} />
        </button>
        <span style={{ font: `700 20px ${theme.display}`, color: theme.ink, letterSpacing: '-0.02em' }}>Checkout</span>
      </div>

      <div style={{ padding: '8px 22px 0', flex: 1, overflowY: 'auto' }}>
        <SectionLabel>CONTACT & DELIVERY ADDRESS</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <Field placeholder="Email" value={email} onChange={setEmail} type="email" />
          <div style={{ display: 'flex', gap: 10 }}>
            <Field placeholder="First name" value={firstName} onChange={setFirstName} />
            <Field placeholder="Last name" value={lastName} onChange={setLastName} />
          </div>
          <Field placeholder="Address" value={address1} onChange={setAddress1} />
          <div style={{ display: 'flex', gap: 10 }}>
            <Field placeholder="City" value={city} onChange={setCity} />
            <Field placeholder="Postal code" value={postalCode} onChange={setPostalCode} />
          </div>
          <select
            value={countryCode}
            onChange={(e) => {
              setCountryCode(e.target.value);
              setShippingOptions(null);
            }}
            style={selectStyle}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {shippingOptions === null ? (
          <button
            disabled={!canReview || loadingOptions}
            onClick={loadShippingOptions}
            style={{ ...primaryBtn, marginTop: 20, opacity: canReview ? 1 : 0.5 }}
          >
            {loadingOptions ? 'Checking delivery options…' : 'Continue to delivery'}
          </button>
        ) : (
          <>
            <SectionLabel>DELIVERY METHOD</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {shippingOptions.map((o) => {
                const sel = o.id === shippingOptionId;
                return (
                  <button
                    key={o.id}
                    disabled={selectingShipping}
                    onClick={() => selectShippingOption(o.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      height: 52,
                      padding: '0 16px',
                      borderRadius: 14,
                      border: sel ? 'none' : `1px solid ${theme.lineStrong}`,
                      background: sel ? theme.ink : theme.paper,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ font: `600 14px ${theme.body}`, color: sel ? theme.cream : theme.ink }}>{o.name}</span>
                    <span style={{ font: `600 14px ${theme.display}`, color: sel ? theme.cream : theme.ink }}>{money(o.amount, cart.currencyCode)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {error && <div style={{ font: `500 13px ${theme.body}`, color: theme.accent, marginTop: 14 }}>{error}</div>}
        <div style={{ height: 12 }} />
      </div>

      <div style={{ flexShrink: 0, padding: '14px 22px 30px', background: theme.cream, borderTop: `1px solid rgba(34,27,22,0.06)` }}>
        <button
          disabled={!shippingOptionId || selectingShipping || submitting}
          onClick={handlePlaceOrder}
          style={{ ...primaryBtn, opacity: shippingOptionId && !selectingShipping && !submitting ? 1 : 0.5 }}
        >
          <Icon name="Lock" size={18} />
          <span>{submitting ? 'Placing order…' : `Place order · ${money(total, cart.currencyCode)}`}</span>
        </button>
      </div>
    </div>
  );
}

function Field({ placeholder, value, onChange, type = 'text' }: { placeholder: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        flex: 1,
        height: 48,
        borderRadius: 14,
        border: `1px solid ${theme.lineStrong}`,
        background: theme.paper,
        padding: '0 14px',
        font: `500 14px ${theme.body}`,
        color: theme.ink,
        outline: 'none',
      }}
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ font: `700 12px ${theme.body}`, letterSpacing: '0.08em', color: theme.muted, marginTop: 18 }}>{children}</div>;
}

const circleBtn: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  background: theme.paper,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: theme.ink,
  border: `1px solid ${theme.line}`,
  cursor: 'pointer',
};

const selectStyle: React.CSSProperties = {
  height: 48,
  borderRadius: 14,
  border: `1px solid ${theme.lineStrong}`,
  background: theme.paper,
  padding: '0 14px',
  font: `500 14px ${theme.body}`,
  color: theme.ink,
  outline: 'none',
};

const primaryBtn: React.CSSProperties = {
  width: '100%',
  height: 56,
  borderRadius: 16,
  background: theme.accent,
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 9,
  font: `600 16px ${theme.body}`,
};
