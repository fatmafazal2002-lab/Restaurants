import { Workspace } from "@/components/workspace";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; portal: string }>;
}) {
  const { slug, portal } = await params;
  if (!["admin", "kitchen", "service"].includes(portal)) notFound();
  return (
    <Workspace
      tenantSlug={slug}
      initialPortal={portal as "admin" | "kitchen" | "service"}
    />
  );
}
