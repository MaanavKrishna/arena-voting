import { ImageResponse } from "next/og";
import { ArenaMark } from "./_site/ArenaMark";
import { markColours } from "./_site/brand";

// One large PNG: browsers scale it down for tabs, and the web manifest reuses it for install.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 112,
        }}
      >
        <ArenaMark size={460} />
      </div>
    ),
    { ...size },
  );
}
