"use client";

import { ArrowLeftRight, Check, DoorOpen, QrCode, RotateCw, ShieldCheck, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfig, useConnection } from "wagmi";
import { signTypedData } from "wagmi/actions";
import type { Address, Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useReducedMotionPref } from "@/components/ui/hooks";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { useNetworkGuard } from "@/components/wallet/NetworkGuard";
import { chainName } from "@/config/network";
import { env } from "@/config/env";
import { useArena } from "@/hooks/useArena";
import { useContest } from "@/hooks/useContest";
import { useNow } from "@/hooks/useNow";
import { useVoterState } from "@/hooks/useVoterState";
import { parseContestId, type ContestId } from "@/hooks/shared";
import { cn } from "@/lib/cn";
import { explainError, type ExplainedError } from "@/lib/errors";
import { shortAddress } from "@/lib/format";
import { fade, spring } from "@/lib/motion";
import {
  MAX_ISSUED_AGE_SECONDS,
  TICK_SECONDS,
  createPass,
  encodePassQR,
  retickPass,
  type Pass,
} from "@/lib/pass";
import { PassQR } from "./PassQR";

const TICK_MS = TICK_SECONDS * 1000;
/** Stop showing a pass this long before the Gate would call it expired, so it never fails at the door. */
const EXPIRY_MARGIN_SECONDS = 20;
const CHECKED_IN_POLL_MS = 2_000;

const seconds = (ms: number) => BigInt(Math.floor(ms / 1000));

/** Remaining whole minutes of a pass, as copy. */
export function passTimeLeft(issuedAt: bigint, now: bigint): string {
  const left = Number(issuedAt + BigInt(MAX_ISSUED_AGE_SECONDS - EXPIRY_MARGIN_SECONDS) - now);
  if (left <= 0) return "Expired";
  if (left < 60) return "Less than a minute left";
  const m = Math.ceil(left / 60);
  return `${m} min left`;
}

type Stage =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "live" }
  | { kind: "expired" }
  | { kind: "error"; error: ExplainedError };

/**
 * Voter side of Gated check-in: "Get my pass" → one wallet approval → a QR that re-signs itself every
 * 2 s with an in-memory session key → "You're in" as soon as the Gate's check-in lands on chain.
 * Render it only for Gated contests (it renders nothing otherwise).
 */
export function GetPassPanel({ contestId, className }: { contestId: ContestId; className?: string }) {
  const id = parseContestId(contestId);
  const config = useConfig();
  const { chainId, address: arena } = useArena();
  const { connector } = useConnection();
  const guard = useNetworkGuard();
  const contest = useContest(contestId);
  const voter = useVoterState(contestId);
  const now = useNow();
  const reduce = useReducedMotionPref();

  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [pass, setPass] = useState<Pass | null>(null);
  const sessionKey = useRef<Hex | null>(null);
  const account = guard.address;

  const checkedIn = voter.data?.isCheckedIn === true;
  const passkeyWallet = connector?.id === "baseAccount";
  const closed = contest.phase === "ended" || contest.phase === "finalized";

  const forget = useCallback(() => {
    sessionKey.current = null; // the session key only ever lives in this ref
    setPass(null);
  }, []);

  // A different wallet means a different pass.
  const [passFor, setPassFor] = useState<Address | undefined>(account);
  if (passFor !== account) {
    setPassFor(account);
    if (pass) {
      setPass(null);
      setStage({ kind: "idle" });
    }
  }

  const getPass = useCallback(async () => {
    if (!account || !arena || id === undefined) return;
    const key = generatePrivateKey();
    sessionKey.current = key;
    setStage({ kind: "signing" });
    try {
      const issuedAt = seconds(Date.now());
      const created = await createPass({
        chainId,
        arena,
        contestId: id,
        voter: account,
        sessionPrivateKey: key,
        issuedAt,
        now: issuedAt,
        signTypedData: (args) => signTypedData(config, { ...args, account }),
      });
      if (sessionKey.current !== key) return; // superseded
      // Approval can take a while; start on the current tick.
      const fresh = await retickPass(created, { chainId, arena, sessionPrivateKey: key, now: seconds(Date.now()) });
      setPass(fresh);
      setStage({ kind: "live" });
    } catch (err) {
      if (sessionKey.current === key) sessionKey.current = null;
      setStage({ kind: "error", error: explainError(err) });
    }
  }, [account, arena, id, chainId, config]);

  // Re-tick on every 2 s boundary of the device clock (the Gate checks ±2 ticks of its own clock).
  const live = stage.kind === "live" && pass !== null;
  const passRef = useRef(pass);
  useEffect(() => {
    passRef.current = pass;
  });
  useEffect(() => {
    if (!live || !arena) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = async () => {
      const current = passRef.current;
      const key = sessionKey.current;
      if (cancelled || !current || !key) return;
      const nowMs = Date.now();
      const nowS = seconds(nowMs);
      if (nowS >= current.issuedAt + BigInt(MAX_ISSUED_AGE_SECONDS - EXPIRY_MARGIN_SECONDS)) {
        sessionKey.current = null;
        setPass(null);
        setStage({ kind: "expired" });
        return;
      }
      try {
        const next = await retickPass(current, { chainId, arena, sessionPrivateKey: key, now: nowS });
        if (!cancelled && next.tick !== passRef.current?.tick) setPass(next);
      } catch {
        // key was dropped mid-tick (checked in, or wallet changed); the effect is being torn down
      }
      if (!cancelled) timer = setTimeout(step, TICK_MS - (Date.now() % TICK_MS) + 15);
    };
    timer = setTimeout(step, TICK_MS - (Date.now() % TICK_MS) + 15);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [live, arena, chainId]);

  // Keep the screen on while the pass is up (best effort; not every browser has it).
  useEffect(() => {
    if (!live) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const wl = (navigator as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } })
      .wakeLock;
    wl?.request("screen")
      .then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release().catch(() => {});
    };
  }, [live]);

  // Watch the chain for this wallet's check-in while the pass is up.
  const refetchVoter = voter.refetch;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void refetchVoter(), CHECKED_IN_POLL_MS);
    return () => clearInterval(t);
  }, [live, refetchVoter]);

  // The moment it lands: drop the key, celebrate, buzz once.
  const [celebrate, setCelebrate] = useState(false);
  if (checkedIn && pass) {
    setPass(null);
    setStage({ kind: "idle" });
    setCelebrate(true);
  }
  useEffect(() => {
    if (celebrate) navigator.vibrate?.(10);
  }, [celebrate]);
  useEffect(() => () => forget(), [forget]);
  // No pass on screen and none being made: the session key has no reason to exist.
  useEffect(() => {
    if (!pass && stage.kind !== "signing") sessionKey.current = null;
  }, [pass, stage.kind]);

  const text = useMemo(() => (pass ? encodePassQR(pass) : undefined), [pass]);

  if (contest.data && contest.data.presence !== 2) return null;

  let body: React.ReactNode;
  let key: string;

  if (checkedIn) {
    key = "in";
    body = <CheckedIn celebrate={celebrate} reduce={reduce} />;
  } else if (guard.state === "checking" || (account && voter.isPending)) {
    key = "loading";
    body = (
      <div className="flex justify-center py-10" role="status" aria-label="Loading">
        <Spinner className="size-6" />
      </div>
    );
  } else if (closed) {
    key = "closed";
    body = (
      <Intro
        icon={<DoorOpen className="size-6" strokeWidth={1.75} />}
        title="Check-in has closed"
        body="Voting has ended for this contest, so the door is closed."
      />
    );
  } else if (guard.state === "connect") {
    key = "connect";
    body = (
      <Intro
        icon={<Wallet className="size-6" strokeWidth={1.75} />}
        title="Connect to get your door pass"
        body="Door check-in needs MetaMask or another browser wallet. Your pass is a live code that proves this wallet is yours."
        action={<ConnectButton hidePasskey className="h-10 px-5" />}
      />
    );
  } else if (passkeyWallet) {
    key = "passkey";
    body = (
      <Intro
        icon={<Wallet className="size-6" strokeWidth={1.75} />}
        title="Door check-in needs a browser wallet"
        body="Face ID wallets make codes too big to scan quickly at the door. Connect MetaMask or another browser wallet instead."
      />
    );
  } else if (guard.state === "wrong-network") {
    key = "network";
    body = (
      <Intro
        icon={<ArrowLeftRight className="size-6" strokeWidth={1.75} />}
        title={`Switch to ${chainName} first`}
        body={guard.switchError?.title ?? "Your pass is tied to the network this contest runs on."}
        action={
          <Button onClick={guard.switchNetwork} loading={guard.isSwitching}>
            Switch to {chainName}
          </Button>
        }
      />
    );
  } else if (live && text && pass) {
    key = "live";
    body = (
      <div className="flex flex-col items-center gap-4">
        <PassQR value={text} />
        <div className="flex flex-col items-center gap-1 text-center" aria-live="polite">
          <p className="text-title-3 text-fg">Hold this up to the gate camera</p>
          <p className="text-footnote text-fg-muted">
            <span className="text-mono">{shortAddress(pass.voter)}</span>
            {" · "}
            <span className="tabular">{now > 0n ? passTimeLeft(pass.issuedAt, now) : "Live"}</span>
            {" · turn your brightness up"}
          </p>
        </div>
        <p className="text-footnote text-fg-muted flex items-center gap-2">
          <Spinner className="size-3.5" />
          Waiting for the gate…
        </p>
      </div>
    );
  } else if (stage.kind === "signing") {
    key = "signing";
    body = (
      <Intro
        icon={<Spinner className="size-6" />}
        title="Confirm in your wallet"
        body="Approve the request to create your pass. It's free and doesn't move any money."
      />
    );
  } else {
    key = stage.kind === "error" ? "error" : stage.kind === "expired" ? "expired" : "idle";
    const problem = stage.kind === "error" ? stage.error : null;
    body = (
      <Intro
        icon={<QrCode className="size-6" strokeWidth={1.75} />}
        title={stage.kind === "expired" ? "Your pass expired" : "Your door pass"}
        body={
          stage.kind === "expired"
            ? "Passes last 10 minutes. Get a new one when you're near the door."
            : "Show a live code at the door. It changes every 2 seconds, so a screenshot won't work. One approval in your wallet, no fee."
        }
        problem={problem}
        action={
          <Button
            size="lg"
            onClick={getPass}
            icon={
              stage.kind === "idle" ? (
                <QrCode className="size-5" strokeWidth={1.75} aria-hidden />
              ) : (
                <RotateCw className="size-5" strokeWidth={1.75} aria-hidden />
              )
            }
          >
            {stage.kind === "idle" ? "Get my pass" : stage.kind === "expired" ? "Get a new pass" : "Try again"}
          </Button>
        }
      />
    );
  }

  return (
    <section
      aria-label="Door pass"
      data-pass={env.NEXT_PUBLIC_E2E ? (text ?? "") : undefined}
      data-pass-state={checkedIn ? "in" : key}
      className={cn("solid squircle relative overflow-hidden rounded-lg p-5 shadow-sm md:p-6", className)}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={key}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
          transition={reduce ? fade : spring.smooth}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function Intro({
  icon,
  title,
  body,
  action,
  problem,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
  problem?: ExplainedError | null;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span aria-hidden className="bg-accent/12 text-accent grid size-12 place-items-center rounded-full">
        {icon}
      </span>
      <h3 className="text-title-2 text-fg text-balance">{title}</h3>
      <p className="text-callout text-fg-muted max-w-sm text-pretty">{body}</p>
      {problem ? (
        <p role="alert" className="text-footnote text-danger-text max-w-sm">
          {problem.title}
          {problem.detail ? ` ${problem.detail}` : ""}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

function CheckedIn({ celebrate, reduce }: { celebrate: boolean; reduce: boolean }) {
  const pop = celebrate && !reduce;
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center" role="status" aria-live="polite">
      <div className="relative grid size-24 place-items-center">
        {pop ? (
          <motion.span
            aria-hidden
            className="bg-verified/30 absolute inset-0 rounded-full"
            initial={{ scale: 0.6, opacity: 0.9 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : null}
        <motion.span
          className="bg-verified text-bg relative grid size-20 place-items-center rounded-full shadow-md"
          initial={pop ? { scale: 0 } : false}
          animate={{ scale: 1 }}
          transition={spring.celebrate}
        >
          <Check className="size-10" strokeWidth={2.5} aria-hidden />
        </motion.span>
      </div>
      <h3 className="text-title-1 text-fg">You&rsquo;re in ✓</h3>
      <p className="text-callout text-fg-muted max-w-sm text-pretty">
        Checked in at the door. Your vote will count.
      </p>
      <p className="text-footnote text-verified-text inline-flex items-center gap-1.5">
        <ShieldCheck className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        Recorded on the network
      </p>
    </div>
  );
}
