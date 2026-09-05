import { useState } from "react";
import {
  clearPaymentSettings,
  getPaymentSettings,
  savePaymentSettings,
} from "../../api/admin.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PasswordInput,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import styles from "./AdminPaymentsPage.module.css";

/**
 * Razorpay credentials, and the demo/live switch.
 *
 * Two things this screen must never do: show a stored secret, or let one be
 * saved without being checked. A secret in a form field is a secret in the DOM
 * and in every response cache between here and the server, so the panel offers
 * Replace rather than Edit. And a key pair that Razorpay rejects would leave
 * the platform believing it is live while every payment fails, so it is
 * verified before anything is written.
 *
 * The mode banner is deliberately loud. Ketan demonstrates this product to
 * prospective hotels, and the one thing worse than a demo that looks fake is a
 * live payment nobody realised was live.
 */

const BLANK = { keyId: "", keySecret: "", webhookSecret: "" };

const AdminPaymentsPage = () => {
  const toastError = useAppStore((s) => s.toastError);
  const toastSuccess = useAppStore((s) => s.toastSuccess);

  const { data, loading, error, run } = useAsync(getPaymentSettings, []);

  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const settings = data;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const dirty = Boolean(form.keyId || form.keySecret || form.webhookSecret);

  const save = async () => {
    setBusy(true);
    try {
      await savePaymentSettings({
        keyId: form.keyId || undefined,
        keySecret: form.keySecret || undefined,
        webhookSecret: form.webhookSecret || undefined,
      });
      setForm(BLANK);
      setConfirming(false);
      toastSuccess("Credentials verified and saved");
      run();
    } catch (err) {
      toastError(err.message || "Could not save those credentials");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await clearPaymentSettings();
      toastSuccess("Credentials removed");
      run();
    } catch (err) {
      toastError(err.message || "Could not remove those credentials");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={run} />;

  const live = settings.mode === "LIVE";

  return (
    <div>
      <PageHead
        title="Payments"
        subtitle="Razorpay credentials, and whether real money is moving."
      />

      {/* The single most important fact on this screen. */}
      <div className={`${styles.banner} ${live ? styles.live : styles.demo}`}>
        <span className={styles.bannerDot} aria-hidden="true" />
        <div>
          <b>{live ? "LIVE MODE" : "DEMO MODE"}</b>
          <p>
            {live
              ? "Payments are real. Guests are charged and hotels are paid."
              : "No Razorpay credentials configured. Bills work end to end, but no money moves."}
          </p>
        </div>
      </div>

      {settings.restartRequired && (
        <div className="notice-bad">
          Credentials changed. This server is still running in {settings.mode} mode and will
          switch to {settings.modeAfterRestart} when it restarts.
        </div>
      )}

      <div className={styles.grid}>
        <Card title="Razorpay keys">
          {!settings.canStoreSecrets && (
            <div className="notice-bad">
              CREDENTIAL_ENCRYPTION_KEY is not set on the server, so secrets cannot be stored
              safely. Set it before entering a key.
            </div>
          )}

          <dl className={styles.status}>
            <div>
              <dt>Key ID</dt>
              <dd>
                {settings.keyId || <i>Not set</i>}
                {settings.source.keyId === "env" && <Badge>from env</Badge>}
              </dd>
            </div>
            <div>
              <dt>Key secret</dt>
              <dd>
                {settings.hasSecret ? "•••• stored" : <i>Not set</i>}
                {settings.source.keySecret === "env" && <Badge>from env</Badge>}
              </dd>
            </div>
            <div>
              <dt>Webhook secret</dt>
              <dd>
                {settings.hasWebhookSecret ? "•••• stored" : <i>Not set</i>}
                {settings.source.webhookSecret === "env" && <Badge>from env</Badge>}
              </dd>
            </div>
            {settings.verifiedAt && (
              <div>
                <dt>Last verified</dt>
                <dd>{new Date(settings.verifiedAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>

          <p className={styles.note}>
            Values set in the environment take precedence and cannot be changed here.
          </p>

          <Field label="Key ID" hint="rzp_live_… or rzp_test_…">
            <Input value={form.keyId} onChange={set("keyId")} placeholder="rzp_live_XXXXXXXX" />
          </Field>

          <Field label="Key secret" hint="Checked against Razorpay before it is saved.">
            <PasswordInput
              value={form.keySecret}
              onChange={set("keySecret")}
              placeholder={settings.hasSecret ? "Replace the stored secret" : "Enter the secret"}
            />
          </Field>

          <Field label="Webhook secret" hint="From Razorpay's webhook settings.">
            <PasswordInput
              value={form.webhookSecret}
              onChange={set("webhookSecret")}
              placeholder={
                settings.hasWebhookSecret ? "Replace the stored secret" : "Enter the secret"
              }
            />
          </Field>

          <Button
            block
            disabled={!dirty || busy || !settings.canStoreSecrets}
            onClick={() => setConfirming(true)}
          >
            Verify and save
          </Button>

          {(settings.source.keyId === "database" || settings.source.keySecret === "database") && (
            <Button block variant="ghost" onClick={clear} disabled={busy}>
              Remove stored credentials
            </Button>
          )}
        </Card>

        <Card title="How the switch works">
          <ol className={styles.steps}>
            <li>
              <b>Mode follows the credentials</b>
              <p>
                There is no demo toggle. If a valid key pair is configured the platform is live;
                if not, it runs the demo provider. A flag could disagree with the keys, and then
                nobody could say which was true.
              </p>
            </li>
            <li>
              <b>Nothing else changes</b>
              <p>
                Same screens, same bills, same events, same records. Only the payment provider
                differs, so what a hotel is shown in a demo is what they get.
              </p>
            </li>
            <li>
              <b>Demo records stay out of the money</b>
              <p>
                Demo bills are real rows, flagged as demo, and excluded from revenue, commission
                and settlements.
              </p>
            </li>
            <li>
              <b>A restart applies the change</b>
              <p>
                The provider is resolved once at boot, so one payment can never be created with
                one provider and confirmed by another.
              </p>
            </li>
          </ol>
        </Card>
      </div>

      {/* Going live is deliberate, never incidental. */}
      <Modal
        open={confirming}
        title={settings.hasSecret ? "Replace credentials?" : "Switch to live payments?"}
        onClose={() => setConfirming(false)}
        footer={
          <Button block onClick={save} disabled={busy}>
            {busy ? "Verifying with Razorpay…" : "Verify and save"}
          </Button>
        }
      >
        <p className={styles.confirmText}>
          These keys will be checked against Razorpay and then stored encrypted. Once this server
          restarts, <b>guests will be charged real money</b> and hotels will be paid out for
          every bill they send.
        </p>
        <p className={styles.confirmText}>
          Make sure the webhook secret matches the endpoint configured in your Razorpay
          dashboard, or payments will not be confirmed reliably.
        </p>
      </Modal>
    </div>
  );
};

export default AdminPaymentsPage;
