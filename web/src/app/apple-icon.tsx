import { ImageResponse } from "next/og";
import { ArenaMark } from "./_site/ArenaMark";
import { markColours } from "./_site/brand";

// Square and full-bleed: iOS applies its own rounded mask.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: markColours.graphite,
        }}
      >
        <ArenaMark size={140} />
      </div>
    ),
    { ...size },
  );
}
