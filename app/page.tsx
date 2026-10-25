import { LandingPage } from "@/components/landing-page";
import { Workspace } from "@/components/workspace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Preserve existing table links and restaurant/auth callbacks at the root.
  if (params.table || params.restaurant || params.code) return <Workspace />;
  return <LandingPage />;
}
