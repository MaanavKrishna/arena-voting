"use client";

import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { ImageUpload } from "./ImageUpload";
import { LIMITS, type StepProps } from "./draft";

export function StepBasics({ draft, set, errors, blur }: StepProps) {
  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Contest name"
        counter={{ value: draft.title, max: LIMITS.titleBytes }}
        error={errors.title}
      >
        <Input
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          onBlur={() => blur("title")}
          placeholder="Spring Demo Day"
          autoComplete="off"
          enterKeyHint="next"
        />
      </Field>
      <Field
        label="Description"
        optional
        helper="What are people voting on? Shown on the contest page."
        counter={{ value: draft.description, max: LIMITS.descriptionBytes }}
        error={errors.description}
      >
        <Textarea
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          onBlur={() => blur("description")}
          rows={4}
          placeholder="Ten teams, five minutes each. The room picks the winner."
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <p className="text-footnote text-fg">
          Cover image <span className="text-fg-muted">(optional)</span>
        </p>
        <ImageUpload
          label="Cover image"
          aspect="2 / 1"
          value={draft.cover}
          onChange={(cover) => set({ cover })}
          hint="Shows at the top of your contest. PNG, JPEG, WebP or GIF."
        />
      </div>
    </div>
  );
}
