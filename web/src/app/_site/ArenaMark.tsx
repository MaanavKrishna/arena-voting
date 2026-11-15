import { markColours } from "./brand";

/**
 * The Arena mark: five seats on a half ring, the centre seat in Ember. Plain SVG so it renders in
 * ImageResponse (icons, OG images) as well as in the page. Geometry is in a 100 x 100 box.
 */
const SEATS = [180, 135, 90, 45, 0].map((deg) => {
  const rad = (deg * Math.PI) / 180;
  return { cx: 50 + 30 * Math.cos(rad), cy: 65 - 30 * Math.sin(rad), centre: deg === 90 };
});

export function ArenaMark({
  size,
  seat = markColours.seat,
  ember = markColours.ember,
}: {
  size: number;
  seat?: string;
  ember?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      {SEATS.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={9} fill={s.centre ? ember : seat} />
      ))}
    </svg>
  );
}
