import { useState } from "react";
import { Link } from "react-router-dom";
import { distributionOverview, runRebate, updateSettings } from "../../api/admin.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  Select,
  Slider,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import DistributionShow from "../../features/panel/distribution/DistributionShow.jsx";
import CoinsReceived from "../../features/panel/distribution/CoinsReceived.jsx";
import {
  computeRebate,
  periodLabel,
  periodOptions,
  sampleRows,
  shiftPeriod,
  showRows,
} from "../../features/panel/distribution/distributionMath.js";
import { adminHotelPath } from "../../constants/routePaths.js";
import { formatCoins, formatDate, formatDateTime, initials } from "../../utils/format.js";
import styles from "./AdminDistributionPage.module.css";

/**
 * Coin distribution — the month-end payout, as its own tab.
 *
 * After a month closes, every hotel gets back a share (the payout rate, 50% by
 * default) of the coins its guests redeemed there. This page shows each
 * hotel's month, sets the rate, and runs the distribution exactly once per
 * month, with the animated show on top.
 *
 * TEST MODE runs the same show from the same figures — or sample hotels when
 * the month is empty — without calling the run endpoint at all. It is for
 * demonstrating the feature, so it must never be able to move a coin: the only
 * code path that calls runRebate is `distribute`, and test mode never reaches
 * it.
 */

const STATE_PILL = {
  OPEN: { label: "Month in progress", tone: "open" },
  EMPTY: { label: "Nothing to distribute", tone: "muted" },
  READY: { label: "Ready to distribute", tone: "ready" },
  RUNNING: { label: "Distribution in progress", tone: "open" },
  COMPLETE: { label: "Distribution complete", tone: "done" },
};

const columns = [
  { key: "hotel", label: "Hotel" },
  { key: "purchased", label: "Coins purchased", num: true },
  { key: "redeemed", label: "Coins redeemed", num: true },
  { key: "bills", label: "Bills", num: true },
  { key: "payout", label: "Payout", num: true },
  { key: "status", label: "Status" },
];

/** Fallback when the post-run refetch fails: the run's own result, joined to names. */
const rowsFromResult = (result, overview) => {
  const byId = new Map((overview?.rows || []).map((r) => [String(r.hotelId), r]));
  return (result?.settled || [])
    .map((s) => {
      const r = byId.get(String(s.hotelId)) || {};
      return {
        hotelId: String(s.hotelId),
        name: r.name || s.hotelName || "Hotel",
        city: r.city || null,
        logoUrl: r.logoUrl || null,
        coins: s.coinsCredited,
        redeemed: s.coinsRedeemed,
        coinInventory: s.coinInventory ?? r.coinInventory ?? 0,
      };
    })
    .sort((a, b) => b.coins - a.coins);
};

const AdminDistributionPage = () => {
  // Null until the admin picks a month: the server decides what "last month"
  // is, so a browser in another timezone cannot open on the wrong one.
  const [period, setPeriod] = useState(null);
  // Cached per month, so flicking between months repaints instantly. A run
  // writes its fresh overview back through setData; every visit revalidates.
  const { data, loading, error, run, setData } = useAsync(
    () => distributionOverview(period),
    [period],
    { cacheKey: "admin.distribution" }
  );

  const [testMode, setTestMode] = useState(false);
  const [draftRate, setDraftRate] = useState(null);
  const [savingRate, setSavingRate] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [show, setShow] = useState(null);
  const [preview, setPreview] = useState(null);

  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);
  const setDistributionPending = useAppStore((s) => s.setDistributionPending);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState error={error} onRetry={run} />;

  const d = data;
  const savedRate = d.ratePercent;
  const rate = draftRate == null ? savedRate : Number(draftRate);
  const rateDirty = draftRate != null && Number(draftRate) !== savedRate;
  const complete = d.state === "COMPLETE";

  // Payout per hotel: the settlement once paid (frozen), otherwise a forecast
  // at the rate on screen — which may be an unsaved draft.
  const payoutOf = (r) => (r.settlement ? r.settlement.coinsCredited : computeRebate(r.coinsRedeemed, rate));
  const due = d.rows.filter((r) => !r.settlement && payoutOf(r) > 0);
  const projectedTotal = due.reduce((s, r) => s + payoutOf(r), 0);
  const payoutTotal = complete ? d.run.coinsCredited : projectedTotal + d.totals.coinsCredited;

  const options = periodOptions(shiftPeriod(d.defaultPeriod, 1), 13);
  const pill = STATE_PILL[d.state] || STATE_PILL.OPEN;
  const noData = !showRows(d, { ratePercent: rate }).length;

  /* ---- actions ------------------------------------------------------- */

  const saveRate = async () => {
    setSavingRate(true);
    try {
      await updateSettings({ redemptionRebatePercent: rate });
      await run();
      setDraftRate(null);
      toastSuccess(`Payout rate set to ${rate}%`);
    } catch (err) {
      toastError(err.message || "The rate could not be saved");
    } finally {
      setSavingRate(false);
    }
  };

  /** The ONLY path that moves coins. Test mode never reaches it. */
  const distribute = async () => {
    setConfirming(false);
    setShow({
      key: Date.now(),
      mode: "live",
      rows: null,
      previewRows: showRows(d, { source: "projected", ratePercent: savedRate }),
      ratePercent: savedRate,
      error: null,
    });

    let result;
    try {
      result = await runRebate({ period: d.period, expectedRatePercent: savedRate });
    } catch (err) {
      setShow((s) => s && { ...s, error: err.message || "The distribution could not be completed" });
      run().catch(() => {});
      return;
    }

    if (d.period === d.defaultPeriod) setDistributionPending(0);

    // Animate what was PAID, read back from the settlements — which also
    // covers hotels a resumed run had already credited.
    let rows;
    try {
      const fresh = await distributionOverview(d.period);
      setData(fresh);
      rows = showRows(fresh, { source: "credited" });
    } catch {
      rows = rowsFromResult(result, d);
      run().catch(() => {});
    }
    setShow((s) => s && { ...s, rows });
  };

  const startTest = () => {
    let rows = showRows(d, { source: "projected", ratePercent: rate });
    const sample = !rows.length;
    if (sample) rows = sampleRows(rate || 50);
    setShow({ key: Date.now(), mode: "test", rows, sample, ratePercent: rate || 50, error: null });
  };

  const replayCompleted = () =>
    setShow({
      key: Date.now(),
      mode: "replay",
      rows: showRows(d, { source: "credited" }),
      ratePercent: d.run.ratePercent,
      error: null,
    });

  const replay = () =>
    setShow((s) => ({
      ...s,
      key: Date.now(),
      mode: s.mode === "live" ? "replay" : s.mode,
      rows: s.rows || s.previewRows,
      error: null,
    }));

  const previewHotel = (row) =>
    setPreview({
      hotelName: row.name,
      notice: {
        id: "preview",
        periodLabel: d.periodLabel,
        coinsCredited: row.coins,
        coinsRedeemed: row.redeemed,
        ratePercent: show?.ratePercent ?? rate,
        coinInventory: (row.coinInventory || 0) + (show?.mode === "test" ? row.coins : 0),
      },
    });

  /* ---- copy ---------------------------------------------------------- */

  const summary = {
    OPEN: `${d.periodLabel} is still running. Payouts build up as guests redeem, and the distribution opens on ${formatDate(d.availableFrom)}.`,
    EMPTY: `No guest redeemed coins in ${d.periodLabel}, so there is nothing to pay out.`,
    READY: `${d.periodLabel} has closed. ${due.length} hotel${due.length === 1 ? " is" : "s are"} due ${formatCoins(projectedTotal)} coins — ${rate}% of what their guests redeemed.`,
    RUNNING: `A distribution for ${d.periodLabel} is running right now.`,
    COMPLETE: d.run
      ? `Distributed ${formatDateTime(d.run.completedAt)}${d.run.runBy ? ` by ${d.run.runBy}` : ""}: ${formatCoins(d.run.coinsCredited)} coins to ${d.run.hotelsCredited} hotel${d.run.hotelsCredited === 1 ? "" : "s"} at ${d.run.ratePercent}%.`
      : "",
  }[d.state];

  const cta = (() => {
    if (testMode) return { label: "Run test distribution", onClick: startTest, enabled: true };
    if (d.state === "READY") {
      return {
        label: `Distribute ${formatCoins(projectedTotal)} coins`,
        onClick: () => setConfirming(true),
        enabled: !rateDirty && savedRate > 0 && projectedTotal > 0,
        hint: rateDirty
          ? "Save the new rate first — hotels are paid at the saved rate."
          : savedRate <= 0
            ? "Set a payout rate above 0% to distribute."
            : `One time only for ${d.periodLabel}.`,
      };
    }
    if (d.state === "OPEN") return { label: `Opens ${formatDate(d.availableFrom)}`, enabled: false };
    if (d.state === "RUNNING") return { label: "Distribution in progress…", enabled: false };
    return { label: "Nothing to distribute", enabled: false };
  })();

  /* ---- render -------------------------------------------------------- */

  return (
    <div>
      <PageHead
        title="Coin distribution"
        subtitle="Each month, hotels get back a share of every coin their guests redeemed."
        actions={
          <>
            <Select
              value={d.period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setDraftRate(null);
              }}
              aria-label="Month"
              className="!w-[236px] max-w-full"
            >
              {options.map((p, i) => (
                <option key={p} value={p}>
                  {periodLabel(p)}
                  {i === 0 ? " (in progress)" : p === d.defaultPeriod ? " (last month)" : ""}
                </option>
              ))}
            </Select>
            <button
              type="button"
              role="switch"
              aria-checked={testMode}
              onClick={() => setTestMode((v) => !v)}
              className={`${styles.testSwitch} ${testMode ? styles.testOn : ""}`}
            >
              <span className={styles.track}>
                <i />
              </span>
              Test mode
            </button>
          </>
        }
      />

      {testMode && (
        <div className={styles.testBanner} role="status">
          <span className={styles.testDot} aria-hidden="true" />
          <p>
            <b>Test mode is on.</b> Runs here move no coins, write nothing and notify no hotel — use it
            to show how a month-end distribution works and what hotels see.
            {noData && " This month has no redemptions, so the test plays with sample hotels."}
          </p>
        </div>
      )}

      <section className={styles.hero}>
        <span className={`${styles.floatCoin} ${styles.fc1}`} aria-hidden="true" />
        <span className={`${styles.floatCoin} ${styles.fc2}`} aria-hidden="true" />
        <span className={`${styles.floatCoin} ${styles.fc3}`} aria-hidden="true" />

        <div className={styles.heroMain}>
          <span className={styles.kicker}>Payout for</span>
          <h2 className={styles.period}>{d.periodLabel}</h2>
          <span className={`${styles.pill} ${styles[pill.tone]}`}>
            <i />
            {pill.label}
          </span>
          <p className={styles.summary}>{summary}</p>

          <div className={styles.stats}>
            <span>
              <u>Hotels</u>
              <b>{formatCoins(d.rows.length)}</b>
              <i>with activity</i>
            </span>
            <span>
              <u>Coins purchased</u>
              <b>{formatCoins(d.totals.coinsPurchased)}</b>
              <i>by hotels</i>
            </span>
            <span>
              <u>Coins redeemed</u>
              <b>{formatCoins(d.totals.coinsRedeemed)}</b>
              <i>
                {formatCoins(d.totals.bills)} bill{d.totals.bills === 1 ? "" : "s"}
              </i>
            </span>
            <span className={styles.statGold}>
              <u>{complete ? "Paid out" : "Payout"}</u>
              <b>{formatCoins(payoutTotal)}</b>
              <i>at {complete ? d.run.ratePercent : rate}%</i>
            </span>
          </div>
        </div>

        <div className={styles.panel}>
          {complete ? (
            <div className={styles.doneBox}>
              <span className={styles.doneIcon} aria-hidden="true">
                ✓
              </span>
              <b>Coin distribution complete</b>
              <p>
                {formatCoins(d.run.coinsCredited)} coins went to {d.run.hotelsCredited} hotel
                {d.run.hotelsCredited === 1 ? "" : "s"} at {d.run.ratePercent}%. Every hotel was
                notified.
              </p>
              <Button variant="ghost" onClick={replayCompleted} disabled={!d.run.coinsCredited}>
                Replay animation
              </Button>
            </div>
          ) : (
            <>
              <Field
                label="Payout rate"
                hint={
                  testMode
                    ? "Drag to try a rate — test runs use it without saving."
                    : "Share of each hotel's redeemed coins paid back to it. Applies to every month you distribute from now on."
                }
              >
                <Slider value={draftRate ?? savedRate} onChange={(e) => setDraftRate(e.target.value)} unit="%" />
              </Field>
              {rateDirty && !testMode && (
                <div className="flex items-center gap-2 -mt-1 mb-3">
                  <Button size="sm" onClick={saveRate} disabled={savingRate}>
                    {savingRate ? "Saving…" : `Save ${rate}%`}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDraftRate(null)} disabled={savingRate}>
                    Reset
                  </Button>
                </div>
              )}

              <button
                type="button"
                className={`${styles.cta} ${testMode ? styles.ctaTest : ""}`}
                onClick={cta.onClick}
                disabled={!cta.enabled}
              >
                <span className={styles.ctaCoin} aria-hidden="true" />
                {cta.label}
              </button>
              {cta.hint && <p className={styles.ctaHint}>{cta.hint}</p>}
            </>
          )}
          {testMode && complete && (
            <p className={styles.ctaHint}>The replay is the test for a month already paid.</p>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 [@media(min-width:1100px)]:grid-cols-[2fr_1fr] gap-4 mt-4 items-start">
        <Card title={`Hotels in ${d.periodLabel}`}>
          <Table
            columns={columns}
            rows={d.rows}
            loading={loading}
            empty={{
              title: "No activity this month",
              hint: "Hotels appear here once they buy coins or their guests redeem them.",
            }}
            renderRow={(r) => {
              const payout = payoutOf(r);
              return (
                <tr key={r.hotelId}>
                  <td>
                    <Link to={adminHotelPath(r.hotelId)} className={styles.hotelCell}>
                      <span className={styles.logo}>
                        {r.logoUrl ? <img src={r.logoUrl} alt="" /> : initials(r.name)}
                      </span>
                      <span className="min-w-0">
                        <b>{r.name}</b>
                        {r.city && <i>{r.city}</i>}
                      </span>
                    </Link>
                  </td>
                  <td className="num">{formatCoins(r.coinsPurchased)}</td>
                  <td className="num">{formatCoins(r.coinsRedeemed)}</td>
                  <td className="num">{formatCoins(r.bills)}</td>
                  <td className="num">
                    <b className={payout > 0 ? styles.payout : "text-muted"}>
                      {payout > 0 ? `+${formatCoins(payout)}` : "—"}
                    </b>
                  </td>
                  <td>
                    {r.settlement ? (
                      <Badge
                        tone="ok"
                        className="whitespace-nowrap"
                      >
                        {r.settlement.seenAt ? "Received ✓" : "Credited"}
                      </Badge>
                    ) : payout > 0 ? (
                      <Badge tone={d.state === "READY" ? "warn" : undefined} className="whitespace-nowrap">
                        {d.state === "READY" ? "Due" : "Accruing"}
                      </Badge>
                    ) : (
                      <span className="text-muted text-[12px]">No payout</span>
                    )}
                  </td>
                </tr>
              );
            }}
          />
          <p className="text-[11.5px] text-muted leading-[1.5] mt-3">
            Coins purchased is what each hotel bought from Billionax this month; it does not affect
            the payout. &ldquo;Received&rdquo; means the hotel&rsquo;s manager has seen the
            announcement.
          </p>
        </Card>

        <Card title="Past distributions">
          {d.history.length ? (
            <ul className={styles.history}>
              {d.history.map((h) => (
                <li key={h.period}>
                  <button
                    type="button"
                    onClick={() => {
                      setPeriod(h.period);
                      setDraftRate(null);
                    }}
                    className={h.period === d.period ? styles.historyActive : ""}
                  >
                    <span className={styles.historyTop}>
                      <b>{h.periodLabel}</b>
                      <em>+{formatCoins(h.coinsCredited)}</em>
                    </span>
                    <i>
                      {h.hotelsCredited} hotel{h.hotelsCredited === 1 ? "" : "s"} · {h.ratePercent}% ·{" "}
                      {formatDate(h.completedAt)}
                      {h.runBy ? ` · ${h.runBy}` : ""}
                    </i>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No distributions yet" hint="Each month you distribute is recorded here." />
          )}
        </Card>
      </div>

      <Modal
        open={confirming}
        title={`Distribute ${d.periodLabel}?`}
        onClose={() => setConfirming(false)}
        footer={
          <div className="flex items-center gap-[9px]">
            <Button variant="ghost" block onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button block onClick={distribute}>
              Distribute now
            </Button>
          </div>
        }
      >
        <p className="confirm-text">
          <b>{formatCoins(projectedTotal)} coins</b> will be credited to{" "}
          <b>
            {due.length} hotel{due.length === 1 ? "" : "s"}
          </b>{" "}
          — {savedRate}% of the coins their guests redeemed in {d.periodLabel}. Each hotel is
          notified the moment its coins land.
        </p>
        <div className="notice-warn mt-3">
          This can only be done <b>once</b> for {d.periodLabel}. Afterwards the month shows as
          complete and the button is gone.
        </div>
      </Modal>

      {show && (
        <DistributionShow
          key={show.key}
          mode={show.mode}
          periodLabel={d.periodLabel}
          ratePercent={show.ratePercent}
          rows={show.rows}
          previewRows={show.previewRows}
          sample={show.sample}
          error={show.error}
          onClose={() => setShow(null)}
          onReplay={show.error ? undefined : replay}
          onPreviewHotel={previewHotel}
        />
      )}

      {preview && (
        <CoinsReceived
          preview
          notice={preview.notice}
          hotelName={preview.hotelName}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
};

export default AdminDistributionPage;
