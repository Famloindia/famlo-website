import { notFound } from "next/navigation";

import { createAdminSupabaseClient } from "@/lib/supabase";
import type { FamilyWithPhotos } from "@/lib/discovery";

interface FamilyDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function FamilyDetailPage({
  params
}: Readonly<FamilyDetailPageProps>) {
  const { id } = await params;
  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from("families")
    .select("*, family_photos(url,is_primary)")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  const family = (data as FamilyWithPhotos | null) ?? null;

  if (!family) {
    notFound();
  }

  const primaryPhoto =
    family.family_photos?.find((photo) => photo.is_primary)?.url ??
    family.family_photos?.[0]?.url ??
    null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#EDF5FF_0%,#F8FBFF_42%,#FFFFFF_100%)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div
          className="h-[320px] rounded-[32px] border-[4px] border-[#BCD5F2] bg-[linear-gradient(135deg,#DCEBFA_0%,#F7FBFF_100%)] bg-cover bg-center shadow-[0_18px_0_rgba(26,110,187,0.10)]"
          style={primaryPhoto ? { backgroundImage: `linear-gradient(180deg, rgba(10,32,60,0.10), rgba(10,32,60,0.45)), url(${primaryPhoto})` } : undefined}
        />
        <section className="rounded-[32px] border-[4px] border-[#BCD5F2] bg-white p-6 shadow-[0_18px_0_rgba(26,110,187,0.10)]">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-[#1A6EBB]">Famlo Family Home</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-[#0B2441]">{family.name}</h1>
          <p className="mt-3 text-sm text-[#5A7190]">{[family.village, family.city, family.state].filter(Boolean).join(", ")}</p>
          <p className="mt-5 text-base leading-8 text-[#4C6480]">
            {family.about || family.description || "A culturally rooted stay hosted by a local family."}
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[20px] border-[3px] border-[#D8E7F8] bg-[#F8FBFF] p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">From</p>
              <p className="mt-2 text-xl font-black text-[#0B2441]">
                {family.price_fullday ? `Rs. ${family.price_fullday}` : "Custom"}
              </p>
            </div>
            <div className="rounded-[20px] border-[3px] border-[#D8E7F8] bg-[#F8FBFF] p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">Max guests</p>
              <p className="mt-2 text-xl font-black text-[#0B2441]">{family.max_guests ?? "Flexible"}</p>
            </div>
            <div className="rounded-[20px] border-[3px] border-[#D8E7F8] bg-[#F8FBFF] p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">Status</p>
              <p className="mt-2 text-xl font-black text-[#0B2441]">{family.is_accepting ? "Accepting" : "Request based"}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
