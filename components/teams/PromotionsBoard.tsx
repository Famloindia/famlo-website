"use client";

import type { AdRecord } from "@/lib/discovery";
import AdminAdsAndBanners, { type BannerRecord } from "@/components/admin/AdminAdsAndBanners";
import type { CouponRecord } from "@/components/admin/AdminCoupons";
import AdminCoupons from "@/components/admin/AdminCoupons";

interface Props {
  ads: AdRecord[];
  coupons: CouponRecord[];
  banners: BannerRecord[];
  actorId: string;
}

export default function PromotionsBoard({ ads, coupons, banners, actorId }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <section
        style={{
          background: "#0f172a",
          borderRadius: "24px",
          padding: "24px",
          border: "1px solid rgba(148,163,184,0.24)",
          boxShadow: "0 18px 42px rgba(15,23,42,0.18)"
        }}
      >
        <AdminAdsAndBanners ads={ads as any} banners={banners} adminId={actorId} />
      </section>

      <section
        style={{
          background: "#0f172a",
          borderRadius: "24px",
          padding: "24px",
          border: "1px solid rgba(148,163,184,0.24)",
          boxShadow: "0 18px 42px rgba(15,23,42,0.18)"
        }}
      >
        <AdminCoupons coupons={coupons} adminId={actorId} />
      </section>
    </div>
  );
}
