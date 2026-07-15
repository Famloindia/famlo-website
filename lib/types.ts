export type ApplicationStatus = "pending" | "approved" | "rejected";
export type HostListingStatus =
  | "otp_pending"
  | "draft"
  | "submitted"
  | "approved"
  | "conditional_pending"
  | "paused"
  | "active"
  | "rejected";

export interface FamilyApplication {
  id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  full_name: string;
  email: string;
  phone: string | null;
  whatsapp_number: string | null;
  property_name: string;
  property_address: string;
  village: string | null;
  state: string | null;
  house_type: string | null;
  about_family: string | null;
  languages: string[] | null;
  max_guests: number | null;
  cultural_offerings: string[] | null;
  photo_url: string | null;
  google_maps_link: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ApplicationStatus;
  reviewed_at: string | null;
  review_notes: string | null;
  onboarding_draft_id?: string | null;
}

export interface FriendApplication {
  id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  full_name: string;
  email: string;
  city: string;
  state: string | null;
  phone: string | null;
  interests: string[] | null;
  languages: string[] | null;
  bio: string | null;
  availability: string | null;
  skills: string[] | null;
  activity_types: string[] | null;
  photo_url: string | null;
  status: ApplicationStatus;
  reviewed_at: string | null;
  review_notes: string | null;
}

export interface AppUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  about: string | null;
  avatar_url: string | null;
  role: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface HostOnboardingDraft {
  id: string;
  created_at: string;
  updated_at: string;
  mobile_number: string;
  primary_host_name: string | null;
  city_neighbourhood: string | null;
  otp_code: string | null;
  otp_sent_at: string | null;
  otp_verified_at: string | null;
  current_step: number;
  listing_status: HostListingStatus;
  family_application_id: string | null;
  family_id: string | null;
  payload: Record<string, unknown>;
  compliance: Record<string, unknown>;
  review_notes: string | null;
  conditional_deadline: string | null;
  last_reminder_at: string | null;
}

export interface FamilyProfile {
  id: string;
  user_id: string | null;
  host_id: string | null;
  name: string;
  village: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
  about: string | null;
  max_guests: number | null;
  is_verified: boolean | null;
  is_active: boolean | null;
  is_accepting: boolean | null;
  family_type: string | null;
  created_at: string | null;
  languages: string[] | null;
  password: string | null;
  host_password: string | null;
  host_phone: string | null;
  price_morning: number | null;
  price_afternoon: number | null;
  price_evening: number | null;
  price_fullday: number | null;
  active_quarters: string[] | null;
  blocked_dates: string[] | null;
  platform_commission_pct: number | null;
  host_discount_pct: number | null;
  admin_notes: string | null;
  google_maps_link: string | null;
  lat: number | null;
  lng: number | null;
  updated_at: string | null;
}

export interface CityGuideProfile {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  bio: string | null;
  guide_id: string | null;
  guide_password: string | null;
  is_online: boolean | null;
  is_active: boolean | null;
  is_verified: boolean | null;
  languages: string[] | null;
  activities: string[] | null;
  price_hour: number | null;
  platform_commission_pct: number | null;
  host_discount_pct: number | null;
  admin_notes: string | null;
  created_at: string | null;
}

export interface ApprovalCredentials {
  email: string;
  user_id: string;
  password: string | null;
  account_created: boolean;
  profile_type: "family" | "friend" | "hommie" | "home";
  profile_id: string | null;
  profile_code: string | null;
  email_sent?: boolean;
  email_provider?: string | null;
  email_error?: string | null;
}

export interface AdminManagedFamily extends FamilyProfile {
  user_email: string | null;
  onboarding_completed: boolean;
}

export interface AdminManagedFriend extends CityGuideProfile {
  user_email: string | null;
  onboarding_completed: boolean;
}

export interface AdminMonthlyUsersStat {
  month_label: string;
  count: number;
}

export interface HommieApplication {
  id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  host_name: string;
  email: string;
  phone: string | null;
  property_name: string;
  slug: string;
  city: string;
  state: string;
  locality: string | null;
  address: string;
  google_maps_link: string | null;
  description: string;
  amenities: string[] | null;
  images: string[] | null;
  latitude: number;
  longitude: number;
  nightly_price: number;
  max_guests: number;
  status: ApplicationStatus;
  reviewed_at: string | null;
  review_notes: string | null;
}

export interface Hommie {
  id: string;
  created_at: string;
  updated_at: string;
  application_id: string | null;
  host_user_id: string | null;
  host_name: string;
  email: string;
  phone: string | null;
  property_name: string;
  slug: string;
  city: string;
  state: string;
  locality: string | null;
  address: string;
  google_maps_link: string | null;
  description: string;
  amenities: string[] | null;
  images: string[] | null;
  latitude: number;
  longitude: number;
  nightly_price: number;
  max_guests: number;
  is_active: boolean;
  is_approved: boolean;
  blocked_dates: string[] | null;
  platform_commission_pct: number | null;
  host_discount_pct: number | null;
  admin_notes: string | null;
}

export interface AdminPlatformSettings {
  id: string;
  created_at: string;
  updated_at: string;
  global_family_commission_pct: number;
  global_friend_commission_pct: number;
  global_hommie_commission_pct: number;
  default_family_discount_pct: number;
  default_friend_discount_pct: number;
  default_hommie_discount_pct: number;
}

export interface HommieBookingRequest {
  id: string;
  created_at: string;
  hommie_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  guests: number;
  notes: string | null;
  status: "pending" | "confirmed" | "rejected";
}

export interface HomeApplication {
  id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  host_name: string;
  email: string;
  phone: string | null;
  property_name: string;
  slug: string;
  city: string;
  state: string;
  locality: string | null;
  address: string;
  google_maps_link: string | null;
  description: string;
  food_details: string | null;
  room_type: string;
  images: string[] | null;
  latitude: number;
  longitude: number;
  nightly_price: number;
  max_guests: number;
  status: ApplicationStatus;
  reviewed_at: string | null;
  review_notes: string | null;
}

export interface Home {
  id: string;
  created_at: string;
  updated_at: string;
  application_id: string | null;
  host_user_id: string | null;
  host_name: string;
  email: string;
  phone: string | null;
  property_name: string;
  slug: string;
  city: string;
  state: string;
  locality: string | null;
  address: string;
  google_maps_link: string | null;
  description: string;
  food_details: string | null;
  room_type: string;
  images: string[] | null;
  latitude: number;
  longitude: number;
  nightly_price: number;
  max_guests: number;
  is_active: boolean;
  is_approved: boolean;
  blocked_dates: string[] | null;
  platform_commission_pct: number | null;
  host_discount_pct: number | null;
  admin_notes: string | null;
}

export interface HomeBookingRequest {
  id: string;
  created_at: string;
  home_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  guests: number;
  notes: string | null;
  status: "pending" | "confirmed" | "rejected";
}

export type ApplicationTableName =
  | "family_applications"
  | "friend_applications";

export type ApplicationKind = "family" | "friend";

export interface AdminFamilyApplication extends FamilyApplication {
  application_type: "family";
}

export interface AdminFriendApplication extends FriendApplication {
  application_type: "friend";
}

export type AdminApplication = AdminFamilyApplication | AdminFriendApplication;

export interface Database {
  public: {
    Tables: {
      family_applications: {
        Row: FamilyApplication;
        Insert: Omit<
          FamilyApplication,
          "id" | "created_at" | "updated_at" | "submitted_at" | "reviewed_at" | "status"
        > & {
          reviewed_at?: string | null;
          status?: ApplicationStatus;
        };
        Update: Partial<
          Omit<FamilyApplication, "id" | "created_at" | "updated_at" | "submitted_at">
        >;
      };
      friend_applications: {
        Row: FriendApplication;
        Insert: Omit<
          FriendApplication,
          "id" | "created_at" | "updated_at" | "submitted_at" | "reviewed_at" | "status"
        > & {
          reviewed_at?: string | null;
          status?: ApplicationStatus;
        };
        Update: Partial<
          Omit<FriendApplication, "id" | "created_at" | "updated_at" | "submitted_at">
        >;
      };
      users: {
        Row: AppUser;
        Insert: Omit<AppUser, "created_at" | "updated_at">;
        Update: Partial<Omit<AppUser, "id" | "created_at" | "updated_at">>;
      };
      families: {
        Row: FamilyProfile;
        Insert: Omit<FamilyProfile, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<FamilyProfile, "id" | "created_at" | "updated_at">>;
      };
      city_guides: {
        Row: CityGuideProfile;
        Insert: Omit<CityGuideProfile, "id" | "created_at">;
        Update: Partial<Omit<CityGuideProfile, "id" | "created_at">>;
      };
      admin_platform_settings: {
        Row: AdminPlatformSettings;
        Insert: Omit<AdminPlatformSettings, "created_at" | "updated_at">;
        Update: Partial<Omit<AdminPlatformSettings, "id" | "created_at" | "updated_at">>;
      };
      host_onboarding_drafts: {
        Row: HostOnboardingDraft;
        Insert: Omit<
          HostOnboardingDraft,
          | "id"
          | "created_at"
          | "updated_at"
          | "otp_sent_at"
          | "otp_verified_at"
          | "family_application_id"
          | "family_id"
          | "review_notes"
          | "conditional_deadline"
          | "last_reminder_at"
        > & {
          otp_sent_at?: string | null;
          otp_verified_at?: string | null;
          family_application_id?: string | null;
          family_id?: string | null;
          review_notes?: string | null;
          conditional_deadline?: string | null;
          last_reminder_at?: string | null;
        };
        Update: Partial<Omit<HostOnboardingDraft, "id" | "created_at" | "updated_at">>;
      };
      hommie_applications: {
        Row: HommieApplication;
        Insert: Omit<
          HommieApplication,
          "id" | "created_at" | "updated_at" | "submitted_at" | "reviewed_at" | "status"
        > & {
          reviewed_at?: string | null;
          status?: ApplicationStatus;
        };
        Update: Partial<
          Omit<HommieApplication, "id" | "created_at" | "updated_at" | "submitted_at">
        >;
      };
      hommies: {
        Row: Hommie;
        Insert: Omit<Hommie, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Hommie, "id" | "created_at" | "updated_at">>;
      };
      hommie_booking_requests: {
        Row: HommieBookingRequest;
        Insert: Omit<HommieBookingRequest, "id" | "created_at" | "status"> & {
          status?: "pending" | "confirmed" | "rejected";
        };
        Update: Partial<Omit<HommieBookingRequest, "id" | "created_at">>;
      };
      home_applications: {
        Row: HomeApplication;
        Insert: Omit<
          HomeApplication,
          "id" | "created_at" | "updated_at" | "submitted_at" | "reviewed_at" | "status"
        > & {
          reviewed_at?: string | null;
          status?: ApplicationStatus;
        };
        Update: Partial<
          Omit<HomeApplication, "id" | "created_at" | "updated_at" | "submitted_at">
        >;
      };
      homes: {
        Row: Home;
        Insert: Omit<Home, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Home, "id" | "created_at" | "updated_at">>;
      };
      home_booking_requests: {
        Row: HomeBookingRequest;
        Insert: Omit<HomeBookingRequest, "id" | "created_at" | "status"> & {
          status?: "pending" | "confirmed" | "rejected";
        };
        Update: Partial<Omit<HomeBookingRequest, "id" | "created_at">>;
      };
    };
  };
}
