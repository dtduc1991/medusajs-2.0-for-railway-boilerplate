import { useState } from 'react';
import { theme } from '../theme';
import { Icon } from '../components/Icon';
import { money } from '../data';
import { getRegionId, retrieveCart } from '../lib/backend';
import { listShippingOptions, placeOrder, setCheckoutAddress, setShippingMethod, type CheckoutAddress, type ShippingOption } from '../lib/checkout';
import type { Cart } from '../lib/backend';
import type { Customer } from '../lib/auth';

interface CheckoutScreenProps {
  cart: Cart;
  customer: Customer | null;
  onBack: () => void;
  onPlaced: (orderId: string, displayId: number) => void;
  onGoToAccount: () => void;
}

export function CheckoutScreen({ cart, customer, onBack, onPlaced, onGoToAccount }: CheckoutScreenProps) {
  // Signup now persists a real default address (see auth.ts's signup()), so
  // this prefill has real data to work with for most accounts — falling back
  // to the customer profile's own name/phone/email when there isn't one.
  const defaultAddress = customer?.defaultAddress ?? null;
  const hasPrefill = Boolean(customer?.first_name || customer?.last_name || customer?.phone || defaultAddress);

  const [email, setEmail] = useState(customer?.email ?? '');
  const [phone, setPhone] = useState(defaultAddress?.phone || customer?.phone || '');
  const [firstName, setFirstName] = useState(defaultAddress?.first_name || customer?.first_name || '');
  const [lastName, setLastName] = useState(defaultAddress?.last_name || customer?.last_name || '');
  const [address1, setAddress1] = useState(defaultAddress?.address_1 ?? '');
  const [city, setCity] = useState(defaultAddress?.city ?? '');
  // Tracks whether the form is still showing prefilled info, so the "use a
  // different address" override only appears while there's something to
  // revert from.
  const [usingPrefilledInfo, setUsingPrefilledInfo] = useState(hasPrefill);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const useDifferentAddress = () => {
    setFirstName('');
    setLastName('');
    setPhone('');
    setAddress1('');
    setCity('');
    setUsingPrefilledInfo(false);
  };

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
        phone,
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

  const canReview = email && phone && firstName && lastName && address1 && city;

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
    <div data-testid="checkout-container" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 22px 10px' }}>
        <button onClick={onBack} aria-label="Back" style={circleBtn}>
          <Icon name="ArrowLeft" size={19} />
        </button>
        <span style={{ font: `700 20px ${theme.display}`, color: theme.ink, letterSpacing: '-0.02em' }}>Checkout</span>
      </div>

      <div style={{ padding: '8px 22px 0', flex: 1, overflowY: 'auto' }}>
        {!customer && !nudgeDismissed && (
          <div
            data-testid="checkout-login-nudge"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 14,
              background: theme.goldSoft,
              marginBottom: 14,
            }}
          >
            <span style={{ font: `500 13px ${theme.body}`, color: theme.ink, flex: 1 }}>
              Log in to earn points on this order.
            </span>
            <button
              data-testid="checkout-login-nudge-button"
              onClick={onGoToAccount}
              style={{ ...resetBtn, font: `700 13px ${theme.body}`, color: theme.accent, whiteSpace: 'nowrap' }}
            >
              Log in
            </button>
            <button
              data-testid="checkout-login-nudge-dismiss"
              onClick={() => setNudgeDismissed(true)}
              aria-label="Dismiss"
              style={{ ...resetBtn, color: theme.muted, display: 'flex' }}
            >
              <Icon name="X" size={16} />
            </button>
          </div>
        )}

        <SectionLabel>CONTACT & DELIVERY ADDRESS</SectionLabel>
        {usingPrefilledInfo && (
          <button
            data-testid="use-different-address-button"
            onClick={useDifferentAddress}
            style={{ ...resetBtn, font: `600 13px ${theme.body}`, color: theme.accent, marginTop: 6 }}
          >
            Use a different address
          </button>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <Field testId="email-input" placeholder="Email" value={email} onChange={setEmail} type="email" />
          <Field testId="phone-input" placeholder="Phone number" value={phone} onChange={setPhone} type="tel" />
          <div style={{ display: 'flex', gap: 10 }}>
            <Field testId="first-name-input" placeholder="First name" value={firstName} onChange={setFirstName} />
            <Field testId="last-name-input" placeholder="Last name" value={lastName} onChange={setLastName} />
          </div>
          <Field testId="address-input" placeholder="Address" value={address1} onChange={setAddress1} />
          <Field testId="city-input" placeholder="City" value={city} onChange={setCity} />
        </div>

        {shippingOptions === null ? (
          <button
            data-testid="continue-to-delivery-button"
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
                    data-testid="shipping-option"
                    data-selected={sel}
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

        {error && <div data-testid="checkout-error" style={{ font: `500 13px ${theme.body}`, color: theme.accent, marginTop: 14 }}>{error}</div>}
        <div style={{ height: 12 }} />
      </div>

      <div style={{ flexShrink: 0, padding: '14px 22px 30px', background: theme.cream, borderTop: `1px solid rgba(34,27,22,0.06)` }}>
        <button
          data-testid="place-order-button"
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

function Field({ placeholder, value, onChange, type = 'text', testId }: { placeholder: string; value: string; onChange: (v: string) => void; type?: string; testId: string }) {
  return (
    <input
      data-testid={testId}
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

const resetBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' };

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
