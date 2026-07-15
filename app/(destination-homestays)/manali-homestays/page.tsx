import type { Metadata } from "next";

import {
  buildDestinationMetadata,
  DestinationHomestaysPage,
  type DestinationSearchParams,
} from "../destination-page";

const DESTINATION_NAME = "Manali";
const DESTINATION_SLUG = "manali-homestays";

export const revalidate = 300;

type PageProps = {
  searchParams?: Promise<DestinationSearchParams>;
};

export function generateMetadata(): Metadata {
  return buildDestinationMetadata(DESTINATION_NAME, DESTINATION_SLUG);
}

export default function Page({ searchParams }: PageProps): Promise<React.JSX.Element> {
  return DestinationHomestaysPage({ destinationName: DESTINATION_NAME, searchParams });
}
