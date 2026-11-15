"use client";

import { ArrowRight, Inbox, Plus, Search, Trash2, Trophy, Vote } from "lucide-react";
import { useState } from "react";
import { TiltCard } from "@/components/fx/TiltCard";
import { AddressChip } from "@/components/ui/AddressChip";
import { Badge } from "@/components/ui/Badge";
import { BentoGrid, BentoItem } from "@/components/ui/BentoGrid";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Countdown } from "@/components/ui/Countdown";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { RadioGroup } from "@/components/ui/Radio";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { Textarea } from "@/components/ui/Textarea";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { Demo, Section, StateLabel } from "./Section";
import { useMockClock } from "./useMockClock";

const variants: ButtonVariant[] = ["primary", "secondary", "ghost", "danger"];
const icon = "size-4";

function ButtonsDemo() {
  const [following, setFollowing] = useState(false);
  return (
    <Demo title="Button" note="Press and hold for feedback">
      <div className="flex flex-col gap-5">
        {variants.map((v) => (
          <div key={v} className="flex flex-col gap-2">
            <StateLabel>{v}</StateLabel>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant={v}>{v === "danger" ? "Remove entry" : "Continue"}</Button>
              <Button variant={v} loading>
                Continue
              </Button>
              <Button variant={v} disabled>
                Continue
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <StateLabel>Sizes · icon · toggle (aria-pressed)</StateLabel>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md" icon={<Plus className={icon} strokeWidth={1.75} aria-hidden />}>
              Create contest
            </Button>
            <Button size="lg" iconAfter={<ArrowRight className="size-5" strokeWidth={1.75} aria-hidden />}>
              Vote
            </Button>
            <Button variant="secondary" pressed={following} onClick={() => setFollowing((f) => !f)}>
              {following ? "Following" : "Follow"}
            </Button>
          </div>
        </div>
      </div>
    </Demo>
  );
}

function FormsDemo({ now }: { now: number }) {
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string | undefined>();
  const [prize, setPrize] = useState("0.5");
  const [tagline, setTagline] = useState("Ships on Friday 🚀");
  const [opens, setOpens] = useState("");

  return (
    <Demo title="Input · Textarea · Field · DateTimeField" note="Validates on blur">
      <Field
        label="Contest name"
        helper="Shown on the Stage and in every share link."
        error={titleError}
      >
        <Input
          placeholder="Demo Night 2026"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (titleError && e.target.value.trim()) setTitleError(undefined);
          }}
          onBlur={() => setTitleError(title.trim() ? undefined : "Give your contest a name.")}
        />
      </Field>
      <Field label="Prize" helper="Locked in the contest until a winner is paid.">
        <Input inputMode="decimal" value={prize} onChange={(e) => setPrize(e.target.value)} trailing="ETH" />
      </Field>
      <Field label="Search" optional>
        <Input placeholder="Search contests" leading={<Search className={icon} strokeWidth={1.75} aria-hidden />} />
      </Field>
      <Field label="Tagline" helper="Emoji count as 4 bytes." counter={{ value: tagline, max: 40 }}>
        <Textarea rows={2} value={tagline} onChange={(e) => setTagline(e.target.value)} />
      </Field>
      <Field label="Voting opens" helper="Checked against network time, not your device clock.">
        <DateTimeField value={opens} onChange={setOpens} now={now} />
      </Field>
      <Field label="Disabled">
        <Input disabled value="Can't change after voting opens" readOnly />
      </Field>
    </Demo>
  );
}

function ChoiceDemo() {
  const [mode, setMode] = useState<"anywhere" | "room" | "gated">("room");
  const [tab, setTab] = useState<"live" | "upcoming" | "ended">("live");
  const [notify, setNotify] = useState(true);
  const [blind, setBlind] = useState(false);
  const [agree, setAgree] = useState(true);
  const [optIn, setOptIn] = useState(false);
  const [submissions, setSubmissions] = useState<"curated" | "open" | "list">("curated");
  return (
    <Demo title="SegmentedControl · Toggle · Checkbox · Radio" note="Arrow keys work">
      <div className="flex flex-col gap-2">
        <StateLabel>Presence mode</StateLabel>
        <SegmentedControl
          aria-label="Presence mode"
          stretch
          value={mode}
          onChange={setMode}
          options={[
            { value: "anywhere", label: "Anywhere" },
            { value: "room", label: "Room" },
            { value: "gated", label: "Gated" },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <SegmentedControl
          aria-label="Explore tabs"
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "live", label: "Live" },
            { value: "upcoming", label: "Upcoming" },
            { value: "ended", label: "Ended", disabled: true },
          ]}
        />
        <ThemeToggle />
      </div>
      <div className="divide-border flex flex-col divide-y">
        <Toggle label="Vote notifications" description="Tell me when results change" checked={notify} onCheckedChange={setNotify} />
        <Toggle label="Hide live tallies" checked={blind} onCheckedChange={setBlind} />
        <Toggle label="Disabled" checked disabled onCheckedChange={() => {}} />
      </div>
      <div className="flex flex-col">
        <Checkbox label="I'll be in the room" description="Needed for Room mode" checked={agree} onCheckedChange={setAgree} />
        <Checkbox label="Show my address on the Stage" checked={optIn} onCheckedChange={setOptIn} />
        <Checkbox label="Disabled" checked={false} disabled onCheckedChange={() => {}} />
      </div>
      <RadioGroup
        legend="Who can submit entries?"
        value={submissions}
        onChange={setSubmissions}
        options={[
          { value: "curated", label: "Only me", description: "You add every team yourself" },
          { value: "open", label: "Anyone with the link" },
          { value: "list", label: "Guest list", disabled: true },
        ]}
      />
    </Demo>
  );
}

function StatusDemo({ now, setNow }: { now: number; setNow: (n: number) => void }) {
  const [base] = useState(now);
  return (
    <Demo title="Badge · StatusPill · Countdown" note="Mock clock">
      <div className="flex flex-wrap gap-2">
        <StatusPill status="live" />
        <StatusPill status="upcoming" />
        <StatusPill status="ended" />
        <StatusPill status="verified" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>Testnet</Badge>
        <Badge tone="accent">Room mode</Badge>
        <Badge tone="live">Recording</Badge>
        <Badge tone="verified">Confirmed</Badge>
        <Badge tone="warning">Clock is 40s off</Badge>
        <Badge tone="danger">Removed</Badge>
        <Badge tone="prize" icon={<Trophy strokeWidth={1.75} aria-hidden />}>
          Winner
        </Badge>
      </div>
      <div className="text-callout flex flex-col gap-2">
        <Countdown label="Voting closes in" to={base + 2 * 86_400 + 4 * 3600 + 12 * 60} now={now} />
        <Countdown label="Opens in" to={base + 3725} now={now} />
        <Countdown label="Ends in" to={base + 8} now={now} />
      </div>
      <div>
        <Button size="sm" variant="secondary" onClick={() => setNow(base)}>
          Reset clock
        </Button>
      </div>
    </Demo>
  );
}

function IdentityDemo() {
  return (
    <Demo title="AddressChip" note="Deterministic avatar · copy">
      <div className="flex flex-wrap gap-2">
        <AddressChip address="0x5FbDB2315678afecb367f032d93F642f64180aa3" />
        <AddressChip address="0x70997970C51812dc3A010C7d01b50e0d17dc79C8" label="Organiser" />
        <AddressChip address="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" />
      </div>
      <p className="text-footnote text-fg-muted">
        The explorer link appears when the network config provides an explorer URL (Task 9).
      </p>
    </Demo>
  );
}

function FeedbackDemo() {
  const { toast } = useToast();
  const [sheet, setSheet] = useState(false);
  return (
    <>
      <Demo title="Toast · Sheet" note="Bottom on phone, top-right on desktop">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => toast({ title: "Confirm in your wallet", description: "We'll keep this page updated." })}>
            Status
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast({ tone: "success", title: "Vote counted", description: "Your seat is in the hemicycle." })}>
            Success
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast({ tone: "warning", title: "Your clock is 40 seconds off", description: "We're using network time instead." })}>
            Warning
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast({ tone: "error", title: "You cancelled in your wallet." })}>
            Error
          </Button>
        </div>
        <div>
          <Button icon={<Vote className={icon} strokeWidth={1.75} aria-hidden />} onClick={() => setSheet(true)}>
            Open sheet
          </Button>
        </div>
        <p className="text-footnote text-fg-muted">
          On a phone, drag the handle: a quick flick or a pull past halfway dismisses. Esc closes and focus returns here.
        </p>
      </Demo>
      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        title="Vote for Lumen"
        description="One vote per contest. You can't change it later."
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setSheet(false)}>
              Not yet
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setSheet(false);
                toast({ tone: "success", title: "Vote counted" });
              }}
            >
              Confirm vote
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="bg-bg-sunken squircle aspect-4/3 w-full rounded-md" style={{ backgroundImage: "radial-gradient(60% 80% at 30% 30%, var(--color-entry-1), transparent), radial-gradient(60% 80% at 80% 70%, var(--color-entry-5), transparent)" }} />
          <p className="text-body text-fg-muted">
            Lumen turns any classroom into a live poll. Built in 36 hours by four first-years.
          </p>
          <div className="text-footnote text-fg-muted flex items-center justify-between">
            <span>Network fee</span>
            <span className="tabular text-fg">≈ 0.0001 ETH</span>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function StatesDemo() {
  const [retrying, setRetrying] = useState(false);
  return (
    <Demo title="EmptyState · ErrorState · Skeleton" note="Every list has all three">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border-border squircle rounded-md border border-dashed">
          <EmptyState
            icon={<Inbox strokeWidth={1.75} aria-hidden />}
            title="No entries yet"
            description="Teams you add will show up here."
            action={<Button size="sm" icon={<Plus className={icon} strokeWidth={1.75} aria-hidden />}>Add entry</Button>}
          />
        </div>
        <div className="border-border squircle rounded-md border border-dashed">
          <ErrorState
            title="Couldn't load contests."
            onRetry={() => {
              setRetrying(true);
              setTimeout(() => setRetrying(false), 1200);
            }}
            retrying={retrying}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <div className="flex flex-col gap-3 p-2">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-2 h-10 w-32 rounded-sm" />
        </div>
      </div>
    </Demo>
  );
}

function CardsDemo() {
  return (
    <Demo title="Card · BentoGrid" note="TiltCard on desktop pointer">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader title="Solid card" description="Default surface for forms and lists." />
        </Card>
        <Card interactive tabIndex={0} role="button" aria-label="Interactive card">
          <CardHeader title="Interactive" description="Lifts on hover, settles on press." />
        </Card>
        <TiltCard className="rounded-md">
          <Card className="h-full">
            <CardHeader title="Tilt" description="Follows the pointer up to 8°." />
          </Card>
        </TiltCard>
      </div>
      <BentoGrid>
        <BentoItem
          span={2}
          eyebrow="Step 1"
          title="Lock the prize"
          description="The organiser puts ETH in the contest. Nobody can take it back out."
          visual={<Trophy className="text-prize size-10" strokeWidth={1.5} aria-hidden />}
        />
        <BentoItem
          eyebrow="Step 2"
          title="Vote in the room"
          description="Phones hear the Stage and prove you're there."
          visual={<Vote className="text-accent size-10" strokeWidth={1.5} aria-hidden />}
        />
        <BentoItem
          eyebrow="Step 3"
          title="Winner gets paid"
          description="The contract pays out. No spreadsheet, no trust."
          visual={<ArrowRight className="text-verified size-10" strokeWidth={1.5} aria-hidden />}
        />
        <BentoItem
          span={2}
          eyebrow="Removed"
          title="Danger zone"
          description="Destructive actions use the danger button and say what will happen."
          visual={
            <Button variant="danger" icon={<Trash2 className={icon} strokeWidth={1.75} aria-hidden />}>
              Remove entry
            </Button>
          }
        />
      </BentoGrid>
    </Demo>
  );
}

export function ComponentsSection() {
  const [now, setNow] = useMockClock();
  return (
    <Section
      id="components"
      index="06"
      title="Components"
      description="Every primitive in every state. Hover, focus (Tab) and press are live; loading, disabled and error are pinned."
    >
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="flex flex-col gap-4 lg:gap-6">
          <ButtonsDemo />
          <StatusDemo now={now} setNow={setNow} />
          <IdentityDemo />
          <FeedbackDemo />
        </div>
        <div className="flex flex-col gap-4 lg:gap-6">
          <FormsDemo now={now} />
          <ChoiceDemo />
        </div>
      </div>
      <div className="mt-4 lg:mt-6">
        <StatesDemo />
      </div>
      <div className="mt-4 lg:mt-6">
        <CardsDemo />
      </div>
    </Section>
  );
}
