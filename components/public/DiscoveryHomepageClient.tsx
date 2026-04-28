"use client";

import nextDynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type DiscoveryHomepage from "./DiscoveryHomepage";

const DiscoveryHomepageDynamic = nextDynamic(() => import("./DiscoveryHomepage"), {
  ssr: false,
});

type Props = ComponentProps<typeof DiscoveryHomepage>;

export default function DiscoveryHomepageClient(props: Props) {
  return <DiscoveryHomepageDynamic {...props} />;
}
