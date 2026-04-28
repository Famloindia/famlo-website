export type FamloAgreementSection = {
  id: string;
  title: string;
  body: string[];
};

export const FAMLO_MASTER_PLATFORM_AGREEMENT = {
  title: "Famlo Master Platform Agreement",
  subtitle:
    "Famlo Technologies Private Limited | Governing all parties: Hosts, Users, and Platform | Effective date: 11 April 2025",
  sections: [
    {
      id: "preamble",
      title: "Preamble",
      body: [
        "This Master Platform Agreement applies to every Home Host and every User or Guest who registers on or uses the Famlo platform, website, or mobile application.",
        "Famlo operates a technology-enabled peer-to-peer homestay and experiential tourism marketplace across India.",
      ],
    },
    {
      id: "platform-role",
      title: "Article 2: Nature and Role of the Famlo Platform",
      body: [
        "Famlo is a technology intermediary and marketplace platform. It does not own, operate, manage, control, or supervise listed properties.",
        "Famlo provides the digital marketplace, payment facilitation, trust and safety tools, and customer support infrastructure.",
        "The accommodation contract is formed between the Host and the User when a booking is confirmed.",
      ],
    },
    {
      id: "eligibility",
      title: "Article 3: Eligibility, Registration and Account Obligations",
      body: [
        "Hosts and Users must be at least 18 years old and provide truthful, current, and complete information.",
        "Hosts must have lawful ownership, lease rights, or written authorization to list the property.",
        "False or misleading information may lead to suspension or termination of the account.",
      ],
    },
    {
      id: "kyc",
      title: "Article 4: KYC Verification and Background Checks",
      body: [
        "Hosts must complete KYC before a listing becomes active, including government-issued ID, property proof or NOC, bank account details, and GST details where applicable.",
        "Famlo may use third-party verification agencies, but verification does not guarantee safety or endorse a host.",
        "KYC documents may be retained for legal and regulatory purposes for up to seven years after account closure.",
      ],
    },
    {
      id: "listing-accuracy",
      title: "Article 5: Listing Accuracy, Standards and Misrepresentation",
      body: [
        "Hosts warrant that listing information, photos, amenities, and pricing are accurate, current, and not misleading.",
        "Properties without authorization, under dispute, unsafe, or unlawful to operate must not be listed.",
        "Famlo may review, edit, suspend, or remove listings that violate policy or applicable law.",
      ],
    },
    {
      id: "host-obligations",
      title: "Article 6: Host Obligations and Duty of Care",
      body: [
        "Hosts must keep the property safe, habitable, and honestly represented, and must disclose known hazards.",
        "Hosts are responsible for local legal compliance, licences, NOCs, fire safety, and any applicable tourism or tax registrations.",
        "Hidden cameras in private areas, discrimination, or misuse of guest data are prohibited.",
      ],
    },
    {
      id: "pricing",
      title: "Article 7: Host Pricing, Revenue and Famlo Service Fee",
      body: [
        "Hosts retain pricing autonomy and can set their own accommodation price and additional disclosed charges.",
        "Famlo deducts its service fee and applicable taxes before releasing host payouts.",
        "Payouts are typically released 24 to 72 hours after confirmed guest check-in, subject to disputes and verification.",
      ],
    },
    {
      id: "host-cancellations",
      title: "Article 8: Host Cancellation Policy and Penalties",
      body: [
        "Host-initiated cancellations can trigger penalties, listing blocks, suspension, and guest compensation depending on timing.",
        "Repeated cancellations may result in permanent deactivation and forfeiture of pending payouts.",
      ],
    },
    {
      id: "booking",
      title: "Article 10: Booking Process and Contract Formation",
      body: [
        "Users can search listings without an account, but a verified account is required for booking.",
        "A booking becomes legally binding when payment is successful and a booking confirmation is issued.",
        "The exact property address is shared only after booking confirmation for safety purposes.",
      ],
    },
    {
      id: "payments",
      title: "Article 11: User Payment Terms",
      body: [
        "Payments must be made through the Famlo platform using approved digital methods such as UPI, cards, or net banking.",
        "Famlo holds booking funds in escrow and releases the host payout after verified guest check-in.",
        "Cash or off-platform payments are not recognized by Famlo.",
      ],
    },
    {
      id: "refunds",
      title: "Article 12: User Cancellation and Refund Policy",
      body: [
        "Refund outcomes depend on the listing's cancellation policy and the timing of the cancellation.",
        "No-show stays may result in no refund.",
        "If a property is materially misrepresented, the guest should not check in and should contact Famlo immediately with evidence.",
      ],
    },
    {
      id: "guest-conduct",
      title: "Article 13: Guest Conduct and House Rules",
      body: [
        "Guests must respect the property, follow house rules, and avoid illegal, commercial, or undisclosed gathering use.",
        "Unauthorized extra guests, unlawful activities, or subletting are prohibited.",
      ],
    },
    {
      id: "famlo-obligations",
      title: "Article 14: Famlo Obligations",
      body: [
        "Famlo is responsible for platform availability, payment security, customer support, escrow handling, and good-faith dispute mediation.",
        "Famlo also maintains a trust and safety function for urgent complaints and incidents.",
      ],
    },
    {
      id: "liability",
      title: "Article 15: Limitation of Liability",
      body: [
        "Famlo's liability is limited and it is not directly liable for acts or omissions of hosts or guests, physical incidents at a property, or third-party service failures.",
        "Nothing in the agreement removes statutory rights that cannot legally be excluded.",
      ],
    },
  ] satisfies FamloAgreementSection[],
};
