import { useState } from "react";
import {
  createLinkedAccount,
  saveOnboarding,
  verifyBank,
} from "../../api/admin.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Badge, Button, Card, Field, Input, Select } from "../../components/common/index.jsx";
import styles from "./HotelOnboarding.module.css";

/**
 * Getting a hotel to the point where it can be paid.
 *
 * Three steps, deliberately in this order and gated: KYC, then bank
 * verification, then the payout account. The bank step exists because the
 * details an admin types cannot be trusted with somebody's money — a
 * transposed IFSC is invisible until a payout lands in a stranger's account.
 * So the owner proves control by paying ₹1 from their own UPI app, and what
 * gets stored is what the BANK returned, not what was typed.
 */

const BUSINESS_TYPES = [
  { value: "proprietorship", label: "Proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "private_limited", label: "Private limited" },
];

const STATUS = {
  none: { label: "Not started", tone: undefined },
  pending: { label: "Pending", tone: "warn" },
  activated: { label: "Activated", tone: "ok" },
  needs_clarification: { label: "Needs review", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
};

export const HotelOnboarding = ({ hotel, onChange }) => {
  const toastError = useAppStore((s) => s.toastError);
  const toastSuccess = useAppStore((s) => s.toastSuccess);

  const [business, setBusiness] = useState({
    legalName: hotel.business?.legalName || "",
    type: hotel.business?.type || "proprietorship",
    pan: hotel.business?.pan || "",
    gstin: hotel.business?.gstin || "",
    registeredAddress: hotel.business?.registeredAddress || "",
    city: hotel.business?.city || hotel.city || "",
    state: hotel.business?.state || "",
    pincode: hotel.business?.pincode || "",
  });

  const [stakeholder, setStakeholder] = useState({
    name: hotel.stakeholder?.name || "",
    pan: hotel.stakeholder?.pan || "",
    email: hotel.stakeholder?.email || "",
    phone: hotel.stakeholder?.phone || "",
    address: hotel.stakeholder?.address || "",
  });

  const [bank, setBank] = useState({ accountNumber: "", ifsc: "", beneficiaryName: "" });
  const [accepted, setAccepted] = useState(Boolean(hotel.agreement?.acceptedAt));
  const [busy, setBusy] = useState(false);
  const [drop, setDrop] = useState(null);

  const setB = (k) => (e) => setBusiness((f) => ({ ...f, [k]: e.target.value }));
  const setS = (k) => (e) => setStakeholder((f) => ({ ...f, [k]: e.target.value }));
  const setBank_ = (k) => (e) => setBank((f) => ({ ...f, [k]: e.target.value }));

  const status = STATUS[hotel.linkedAccountStatus] || STATUS.none;
  const verified = Boolean(hotel.bank?.verifiedAt);

  const saveKyc = async () => {
    setBusy(true);
    try {
      await saveOnboarding(hotel._id, { business, stakeholder, agreement: { accepted } });
      toastSuccess("Onboarding saved");
      onChange?.();
    } catch (err) {
      toastError(err.message || "Could not save that");
    } finally {
      setBusy(false);
    }
  };

  const runPennyDrop = async () => {
    setBusy(true);
    try {
      const res = await verifyBank(hotel._id, bank);
      setDrop(res);

      if (res.status === "needs_clarification") {
        toastError("The account holder's name does not match this business");
      } else if (res.status === "verified") {
        toastSuccess("Bank account verified");
      }
      onChange?.();
    } catch (err) {
      toastError(err.message || "That account could not be verified");
    } finally {
      setBusy(false);
    }
  };

  const activate = async (force = false) => {
    setBusy(true);
    try {
      const res = await createLinkedAccount(hotel._id, { force });
      toastSuccess(`Payout account ${res.status}`);
      onChange?.();
    } catch (err) {
      toastError(err.message || "Could not create the payout account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Payouts & KYC"
      action={<Badge tone={status.tone}>{status.label}</Badge>}
      className="mt-4"
    >
      {hotel.linkedAccountStatus !== "activated" && (
        <p className={styles.blocked}>
          This hotel cannot send bills until its payout account is activated.
        </p>
      )}

      {hotel.linkedAccountNote && <div className="notice-bad">{hotel.linkedAccountNote}</div>}

      {/* ---- 1. business ---- */}
      <h4 className={styles.step}>1 · Business</h4>
      <div className={styles.grid}>
        <Field label="Legal name (as on PAN)">
          <Input value={business.legalName} onChange={setB("legalName")} />
        </Field>
        <Field label="Business type">
          <Select value={business.type} onChange={setB("type")}>
            {BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Business PAN">
          <Input value={business.pan} onChange={setB("pan")} placeholder="AAAAA0000A" />
        </Field>
        <Field label="GSTIN (optional)">
          <Input value={business.gstin} onChange={setB("gstin")} />
        </Field>
        <Field label="Registered address">
          <Input value={business.registeredAddress} onChange={setB("registeredAddress")} />
        </Field>
        <Field label="City">
          <Input value={business.city} onChange={setB("city")} />
        </Field>
        <Field label="State">
          <Input value={business.state} onChange={setB("state")} />
        </Field>
        <Field label="Pincode">
          <Input value={business.pincode} onChange={setB("pincode")} />
        </Field>
      </div>

      {/* ---- 2. stakeholder ---- */}
      <h4 className={styles.step}>2 · Stakeholder</h4>
      <div className={styles.grid}>
        <Field label="Full name">
          <Input value={stakeholder.name} onChange={setS("name")} />
        </Field>
        <Field label="PAN">
          <Input value={stakeholder.pan} onChange={setS("pan")} placeholder="AAAAA0000A" />
        </Field>
        <Field label="Email">
          <Input type="email" value={stakeholder.email} onChange={setS("email")} />
        </Field>
        <Field label="Phone">
          <Input value={stakeholder.phone} onChange={setS("phone")} />
        </Field>
        <Field label="Address">
          <Input value={stakeholder.address} onChange={setS("address")} />
        </Field>
      </div>

      <label className={styles.agree}>
        <input
          type="checkbox"
          checked={accepted}
          disabled={Boolean(hotel.agreement?.acceptedAt)}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span>
          The hotel accepts the Billionax platform terms.
          {hotel.agreement?.acceptedAt && (
            <i> Accepted {new Date(hotel.agreement.acceptedAt).toLocaleDateString()}</i>
          )}
        </span>
      </label>

      <Button size="sm" onClick={saveKyc} disabled={busy}>
        {busy ? "Saving…" : "Save details"}
      </Button>

      {/* ---- 3. bank ---- */}
      <h4 className={styles.step}>3 · Bank account</h4>

      {verified ? (
        <dl className={styles.verified}>
          <div>
            <dt>Account</dt>
            <dd>•••• {String(hotel.bank.accountNumber).slice(-4)}</dd>
          </div>
          <div>
            <dt>IFSC</dt>
            <dd>{hotel.bank.ifsc}</dd>
          </div>
          <div>
            <dt>Held by</dt>
            <dd>{hotel.bank.registeredName}</dd>
          </div>
          <div>
            <dt>Bank</dt>
            <dd>{hotel.bank.bankName}</dd>
          </div>
          <div>
            <dt>Name match</dt>
            <dd>{Math.round((hotel.bank.nameMatchScore || 0) * 100)}%</dd>
          </div>
        </dl>
      ) : (
        <>
          <p className={styles.hint}>
            The owner pays ₹1 from their own UPI app to prove they control the account. It is
            refunded automatically. Whatever the bank returns is what gets stored — not what is
            typed here.
          </p>

          <div className={styles.grid}>
            <Field label="Account number">
              <Input value={bank.accountNumber} onChange={setBank_("accountNumber")} />
            </Field>
            <Field label="IFSC">
              <Input value={bank.ifsc} onChange={setBank_("ifsc")} placeholder="HDFC0001234" />
            </Field>
            <Field label="Account holder">
              <Input value={bank.beneficiaryName} onChange={setBank_("beneficiaryName")} />
            </Field>
          </div>

          {drop?.upiLink && (
            <div className={styles.drop}>
              <b>Waiting for the ₹1 payment</b>
              <p>Ask the owner to pay from their UPI app to verify the account.</p>
              <code>{drop.upiLink}</code>
            </div>
          )}

          <Button size="sm" onClick={runPennyDrop} disabled={busy}>
            {busy ? "Verifying…" : "Verify account"}
          </Button>
        </>
      )}

      {/* ---- 4. activate ---- */}
      {verified && hotel.linkedAccountStatus !== "activated" && (
        <>
          <h4 className={styles.step}>4 · Payout account</h4>

          {hotel.linkedAccountStatus === "needs_clarification" ? (
            <>
              <p className={styles.hint}>
                The bank holds this account under a different name. Only override this if you
                have confirmed it is the right account.
              </p>
              <Button size="sm" variant="danger" onClick={() => activate(true)} disabled={busy}>
                Override and activate
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => activate(false)} disabled={busy}>
              {busy ? "Creating…" : "Create payout account"}
            </Button>
          )}
        </>
      )}
    </Card>
  );
};
