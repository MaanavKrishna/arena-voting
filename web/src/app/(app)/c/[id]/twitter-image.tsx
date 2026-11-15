import { renderContestOg } from "@/app/_site/contestOg";

export const alt = "An Arena contest: its title, vote count and the seats filled so far.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderContestOg(id);
}
