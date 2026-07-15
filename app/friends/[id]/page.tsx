import { notFound } from "next/navigation";

import { createAdminSupabaseClient } from "@/lib/supabase";
import type { CityGuideProfile } from "@/lib/types";

interface FriendDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function FriendDetailPage({
  params
}: Readonly<FriendDetailPageProps>) {
  const { id } = await params;
  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from("city_guides")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  const friend = (data as CityGuideProfile | null) ?? null;

  if (!friend) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#EDF5FF_0%,#F8FBFF_42%,#FFFFFF_100%)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border-[4px] border-[#BCD5F2] bg-white p-6 shadow-[0_18px_0_rgba(26,110,187,0.10)]">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-[#1A6EBB]">Famlo Hommie</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-[#0B2441]">{friend.name || "Famlo Hommie"}</h1>
          <p className="mt-3 text-sm text-[#5A7190]">{[friend.city, friend.state].filter(Boolean).join(", ")}</p>
          <p className="mt-5 text-base leading-8 text-[#4C6480]">
            {friend.bio || "A local companion who can help travelers explore the city with confidence."}
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[20px] border-[3px] border-[#D8E7F8] bg-[#F8FBFF] p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">Rate</p>
              <p className="mt-2 text-xl font-black text-[#0B2441]">
                {friend.price_hour ? `Rs. ${friend.price_hour}/hour` : "Custom"}
              </p>
            </div>
            <div className="rounded-[20px] border-[3px] border-[#D8E7F8] bg-[#F8FBFF] p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">Languages</p>
              <p className="mt-2 text-xl font-black text-[#0B2441]">{friend.languages?.[0] || "Local"}</p>
            </div>
            <div className="rounded-[20px] border-[3px] border-[#D8E7F8] bg-[#F8FBFF] p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">Availability</p>
              <p className="mt-2 text-xl font-black text-[#0B2441]">{friend.is_online ? "Online" : "By request"}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
