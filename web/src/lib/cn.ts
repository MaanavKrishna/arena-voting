import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `cn` that knows the design-system type utilities. Our `text-<token>` utilities are font
 * sizes; stock tailwind-merge reads `text-body` as a colour and drops it next to `text-fg`.
 * Use this everywhere.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-xl",
            "display",
            "title-1",
            "title-2",
            "title-3",
            "body",
            "callout",
            "footnote",
            "caption",
            "caption-caps",
            "mono",
            "numeric-xl",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
