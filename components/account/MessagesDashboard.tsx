"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useUser } from "@/components/auth/UserContext";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type ConversationRow = {
  id: string;
  booking_id: string | null;
  family_id: string | null;
  host_id: string | null;
  host_user_id?: string | null;
  last_message: string | null;
  last_message_at: string | null;
  guest_unread: number | null;
  host_unread: number | null;
  typing_user_id?: string | null;
  typing_updated_at?: string | null;
  family?: {
    id: string;
    name: string | null;
    property_name?: string | null;
    city: string | null;
    state: string | null;
    host_photo_url: string | null;
    host_id: string | null;
    user_id: string | null;
    lat_exact?: number | null;
    lng_exact?: number | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
  host?: {
    id: string;
    name: string | null;
    avatar_url: string | null;
    city?: string | null;
    state?: string | null;
    location_url?: string | null;
  } | null;
  host_display_name?: string | null;
  host_avatar_url?: string | null;
  host_location_url?: string | null;
  host_location_label?: string | null;
  property_name?: string | null;
  property_location?: string | null;
};

type MessageRow = {
  id: string;
  sender_id: string | null;
  receiver_id: string | null;
  sender_type: string | null;
  content?: string | null;
  text?: string | null;
  message_type?: string | null;
  image_url?: string | null;
  image_name?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  seen_at?: string | null;
  created_at: string | null;
  pending?: boolean;
};

function extractMapsUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/maps\.google\.com\/\?q=[^\s]+/i);
  return match ? match[0] : null;
}

function buildMapUrl(lat: number | null | undefined, lng: number | null | undefined, label?: string | null): string | null {
  if (typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const cleanLabel = typeof label === "string" ? label.trim() : "";
  return cleanLabel ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanLabel)}` : null;
}

function buildNearbySearchUrl(type: "police" | "hospital", coords: { lat: number; lng: number }): string {
  const query = type === "police" ? "police station" : "hospital";
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${coords.lat},${coords.lng},17z`;
}

function isRecentlyTyping(conversation: ConversationRow, userId: string): boolean {
  if (!conversation.typing_user_id || conversation.typing_user_id === userId || !conversation.typing_updated_at) return false;
  const delta = Date.now() - new Date(conversation.typing_updated_at).getTime();
  return Number.isFinite(delta) && delta >= 0 && delta < 7000;
}

function formatTime(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function mergeMessages(current: MessageRow[], incoming: MessageRow): MessageRow[] {
  if (current.some((message) => message.id === incoming.id)) {
    return current.map((message) =>
      message.id === incoming.id ? { ...message, ...incoming, pending: false } : message
    );
  }

  const withoutTemp = current.filter(
    (message) =>
      !message.pending ||
      (message.text || message.content || "").trim() !== (incoming.text || incoming.content || "").trim()
  );

  return [...withoutTemp, { ...incoming, text: incoming.text || incoming.content || "", pending: false }].sort((left, right) =>
    new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime()
  );
}

function mergeConversations(current: ConversationRow[], incoming: ConversationRow): ConversationRow[] {
  const next = [...current];
  const index = next.findIndex((conversation) => conversation.id === incoming.id);
  if (index >= 0) {
    next[index] = { ...next[index], ...incoming };
  } else {
    next.push(incoming);
  }
  return next.sort(
    (left, right) =>
      new Date(right.last_message_at ?? 0).getTime() - new Date(left.last_message_at ?? 0).getTime()
  );
}

export function MessagesDashboard({
  initialConversationId,
}: Readonly<{ initialConversationId?: string }>): React.JSX.Element {
  const { user, profile, loading } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(initialConversationId ?? null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sharingLocation, setSharingLocation] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyLive, setEmergencyLive] = useState(false);
  const [emergencyCoords, setEmergencyCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [emergencyEndsAt, setEmergencyEndsAt] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const emergencyWatchRef = useRef<number | null>(null);
  const emergencyStopTimerRef = useRef<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const activeConversationLastMessageAtRef = useRef<string | null>(null);
  const authRefreshAttemptedRef = useRef(false);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );
  const hostLocationUrl =
    activeConversation?.host_location_url ??
    buildMapUrl(activeConversation?.family?.lat_exact ?? activeConversation?.family?.lat, activeConversation?.family?.lng_exact ?? activeConversation?.family?.lng, activeConversation?.host_location_label ?? activeConversation?.property_name ?? activeConversation?.family?.name ?? null);
  const hostLocationLabel = activeConversation?.host_location_label ?? activeConversation?.property_name ?? activeConversation?.family?.name ?? "Host location";
  const propertyDisplayName = activeConversation?.property_name ?? activeConversation?.family?.name ?? "Famlo stay";
  const hostDisplayName = activeConversation?.host_display_name ?? activeConversation?.host?.name ?? "Host";
  const hostAvatarUrl = activeConversation?.host_avatar_url ?? activeConversation?.host?.avatar_url ?? null;
  const emergencyPoliceUrl = emergencyCoords ? buildNearbySearchUrl("police", emergencyCoords) : null;
  const emergencyHospitalUrl = emergencyCoords ? buildNearbySearchUrl("hospital", emergencyCoords) : null;
  const userId = user?.id ?? null;

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    let {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token && !authRefreshAttemptedRef.current) {
      authRefreshAttemptedRef.current = true;
      try {
        const { data } = await supabase.auth.refreshSession();
        session = data.session ?? session;
      } catch {
        session = null;
      }
    }

    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    if (userId) {
      headers["x-famlo-user-id"] = userId;
    }
    return headers;
  }, [supabase, userId]);

  const loadConversations = useCallback(
    async (preserveActive = true): Promise<ConversationRow[]> => {
      if (!user) {
        setConversations([]);
        setLoadingConversations(false);
        return [];
      }

      try {
        const response = await fetch("/api/user/conversations", {
          headers: await getAuthHeaders(),
        });
        const data = (await response.json()) as ConversationRow[] | { error?: string };
        if (!response.ok || !Array.isArray(data)) {
          throw new Error((!Array.isArray(data) && data.error) || "Failed to load conversations.");
        }

        setConversations(data);
        if ((!preserveActive || !activeConversationId) && data[0]?.id) {
          setActiveConversationId(data[0].id);
        } else if (activeConversationId && !data.some((conversation) => conversation.id === activeConversationId)) {
          setActiveConversationId(data[0]?.id ?? null);
        }
        return data;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to load conversations.");
        return [];
      } finally {
        setLoadingConversations(false);
      }
    },
    [activeConversationId, getAuthHeaders, user]
  );

  const loadMessages = useCallback(async (conversationId: string, silent = false): Promise<void> => {
    if (!silent) setLoadingMessages(true);
    try {
      const response = await fetch(`/api/user/messages?conversationId=${conversationId}&limit=50`, {
        headers: await getAuthHeaders(),
      });
      const data = (await response.json()) as MessageRow[] | { error?: string };
      if (!response.ok || !Array.isArray(data)) {
        throw new Error((!Array.isArray(data) && data.error) || "Failed to load messages.");
      }
      setMessages(
        [...data].map((message) => ({
          ...message,
          text: message.text || message.content || "",
        }))
      );
      activeConversationLastMessageAtRef.current = data.length > 0 ? data[data.length - 1]?.created_at ?? activeConversationLastMessageAtRef.current : activeConversationLastMessageAtRef.current;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load messages.");
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, [getAuthHeaders]);

  const loadActiveConversationStatus = useCallback(
    async (conversationId: string): Promise<string | null> => {
      try {
        const response = await fetch(`/api/user/conversations?conversationId=${conversationId}&lightweight=1`, {
          headers: await getAuthHeaders(),
        });
        const data = (await response.json()) as Array<{ id?: string; last_message_at?: string | null }> | { error?: string };
        if (!response.ok || !Array.isArray(data)) {
          throw new Error((!Array.isArray(data) && data.error) || "Failed to load conversation status.");
        }
        return data[0]?.last_message_at ?? null;
      } catch (nextError) {
        console.error("Failed to load conversation status:", nextError);
        return null;
      }
    },
    [getAuthHeaders]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadConversations(false);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConversationId) {
      const timer = window.setTimeout(() => {
        startTransition(() => {
          setMessages([]);
        });
      }, 0);
      return () => {
        window.clearTimeout(timer);
      };
    }
    const timer = window.setTimeout(() => {
      void loadMessages(activeConversationId);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    activeConversationLastMessageAtRef.current = activeConversation?.last_message_at ?? null;
  }, [activeConversation?.last_message_at, activeConversationId]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`guest-conversations-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `guest_id=eq.${user.id}`,
        },
        (payload) => {
          const nextConversation = payload.new as ConversationRow | undefined;
          if (nextConversation?.id) {
            setConversations((current) => mergeConversations(current, nextConversation));
          }
          void loadConversations(true);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadConversations, supabase, user]);

  useEffect(() => {
    if (!activeConversationId) return;

    const channel = supabase
      .channel(`guest-messages-${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          const nextMessage = payload.new as MessageRow | undefined;
          if (nextMessage?.id) {
            setMessages((current) => mergeMessages(current, nextMessage));
          }
        }
      )
      .subscribe();

    const interval = window.setInterval(() => {
      void (async () => {
        const latestLastMessageAt = await loadActiveConversationStatus(activeConversationId);
        if (latestLastMessageAt && latestLastMessageAt !== activeConversationLastMessageAtRef.current) {
          activeConversationLastMessageAtRef.current = latestLastMessageAt;
          await loadMessages(activeConversationId, true);
        }
      })();
    }, 4000);

    const onFocus = () => {
      void loadConversations(true);
      void (async () => {
        const latestLastMessageAt = await loadActiveConversationStatus(activeConversationId);
        if (latestLastMessageAt && latestLastMessageAt !== activeConversationLastMessageAtRef.current) {
          activeConversationLastMessageAtRef.current = latestLastMessageAt;
          await loadMessages(activeConversationId, true);
        }
      })();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [activeConversationId, loadActiveConversationStatus, loadConversations, loadMessages, supabase]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (emergencyStopTimerRef.current) window.clearTimeout(emergencyStopTimerRef.current);
      if (emergencyWatchRef.current != null && typeof navigator !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(emergencyWatchRef.current);
      }
    };
  }, []);

  const updateTypingState = useCallback(
    async (nextTyping: boolean): Promise<void> => {
      if (!user || !activeConversationId) return;
      try {
        await fetch("/api/conversations/typing", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
          body: JSON.stringify({
            conversationId: activeConversationId,
            isTyping: nextTyping,
          }),
        });
      } catch {
        return;
      }
    },
    [activeConversationId, getAuthHeaders, user]
  );

  const applyConversationPreview = useCallback(
    (text: string) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeConversationId
            ? {
                ...conversation,
                last_message: text,
                last_message_at: new Date().toISOString(),
                guest_unread: 0,
              }
            : conversation
        )
      );
    },
    [activeConversationId]
  );

  type SendMessageOptions = {
    messageType?: "text" | "image" | "location";
    imageUrl?: string | null;
    imageName?: string | null;
  };

  const sendMessage = useCallback(
    async (text: string, options?: SendMessageOptions): Promise<void> => {
      const trimmed = text.trim();
      if (!user || !activeConversationId || (!trimmed && options?.messageType !== "image") || sending) return;

      const optimisticId = `temp-${Date.now()}`;
      const previewText =
        options?.messageType === "image"
          ? "Sent a photo"
          : options?.messageType === "location"
            ? "Shared location"
            : trimmed;
      const optimisticMessage: MessageRow = {
        id: optimisticId,
        sender_id: user.id,
        receiver_id: activeConversation?.host?.id ?? activeConversation?.family?.user_id ?? null,
        sender_type: "guest",
        message_type: options?.messageType ?? "text",
        text: trimmed,
        content: trimmed,
        image_url: options?.imageUrl ?? null,
        image_name: options?.imageName ?? null,
        created_at: new Date().toISOString(),
        pending: true,
      };

      setSending(true);
      setError(null);
      setMessages((current) => [...current, optimisticMessage]);
      applyConversationPreview(previewText);

      try {
        const response = await fetch("/api/user/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
          body: JSON.stringify({
            conversationId: activeConversationId,
            receiverId: activeConversation?.host?.id ?? activeConversation?.family?.user_id ?? null,
            bookingId: activeConversation?.booking_id ?? null,
            text: trimmed,
            messageType: options?.messageType ?? "text",
            imageUrl: options?.imageUrl ?? null,
            imageName: options?.imageName ?? null,
          }),
        });

        const data = (await response.json()) as MessageRow | { error?: string };
        if (!response.ok || !("id" in data)) {
          throw new Error((!("id" in data) && data.error) || "Failed to send message.");
        }

      setMessages((current) =>
        mergeMessages(
          current.filter((message) => message.id !== optimisticId),
          { ...data, text: data.text || data.content || "", pending: false }
        )
      );
      activeConversationLastMessageAtRef.current = typeof data.created_at === "string" ? data.created_at : activeConversationLastMessageAtRef.current;
      if (options?.messageType !== "image") {
        setDraft("");
      }
        setIsTyping(false);
        if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
        void updateTypingState(false);
      } catch (nextError) {
        setMessages((current) => current.filter((message) => message.id !== optimisticId));
        setError(nextError instanceof Error ? nextError.message : "Failed to send message.");
      } finally {
        setSending(false);
      }
    },
    [activeConversation, activeConversationId, applyConversationPreview, getAuthHeaders, sending, updateTypingState, user]
  );

  async function handleSend(): Promise<void> {
    await sendMessage(draft);
  }

  async function handleImagePick(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user || !activeConversationId) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setUploadingImage(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/user/messages/upload", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: formData,
      });
      const uploadData = (await uploadResponse.json()) as { url?: string; error?: string };
      if (!uploadResponse.ok || !uploadData.url) {
        throw new Error(uploadData.error ?? "Failed to upload image.");
      }

      await sendMessage(draft.trim(), {
        messageType: "image",
        imageUrl: uploadData.url,
        imageName: file.name,
      });
      setDraft("");
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "Could not send image.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function shareLocationInChat(): Promise<void> {
    if (!user || !activeConversationId || !navigator.geolocation) {
      setError("Location sharing is not available on this device.");
      return;
    }

    setSharingLocation(true);
    setError(null);

    try {
      const coords = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) =>
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          () => reject(new Error("Location access was denied.")),
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
        );
      });

      await fetch("/api/user/location", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          userId: user.id,
          lat: coords.lat,
          lng: coords.lng,
          label: "Current location shared in chat",
        }),
      });

      await sendMessage(`Shared location: https://maps.google.com/?q=${coords.lat},${coords.lng}`, {
        messageType: "location",
      });
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : "Could not share location.");
    } finally {
      setSharingLocation(false);
    }
  }

  async function deleteMessage(messageId: string): Promise<void> {
    if (!user || !activeConversationId) return;
    const confirmed = window.confirm("Delete this message?");
    if (!confirmed) return;

    setDeletingMessageId(messageId);
    setError(null);

    try {
      const response = await fetch("/api/user/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          conversationId: activeConversationId,
          bookingId: activeConversation?.booking_id ?? null,
          messageId,
        }),
      });
      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to delete message.");
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                deleted_at: new Date().toISOString(),
                deleted_by: user.id,
                message_type: "deleted",
                text: "Message deleted",
                content: "Message deleted",
                image_url: null,
                image_name: null,
              }
            : message
        )
      );
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete message.");
    } finally {
      setDeletingMessageId(null);
    }
  }

  const updateEmergencyLocation = useCallback(async (coords: { lat: number; lng: number }): Promise<void> => {
    if (!user) return;
    try {
      await fetch("/api/user/location", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          userId: user.id,
          lat: coords.lat,
          lng: coords.lng,
          label: "Emergency live location",
        }),
      });
    } catch {
      return;
    }
  }, [getAuthHeaders, user]);

  const startEmergencyLiveLocation = useCallback(async (): Promise<void> => {
    if (!user || !activeConversationId || !navigator.geolocation) {
      setError("Live location is not available on this device.");
      return;
    }

    const confirmed = window.confirm(
      "Famlo will share your live location with support, the team, and the founder for 1 hour. Continue?"
    );
    if (!confirmed) return;

    setEmergencyOpen(true);
    setEmergencyLive(true);
    setError(null);

    const endAt = Date.now() + 60 * 60 * 1000;
    setEmergencyEndsAt(new Date(endAt).toISOString());

    const sendEmergencyAlert = async (coords: { lat: number; lng: number }): Promise<void> => {
      await fetch("/api/user/support", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          userId: user.id,
          userName: profile?.name ?? user.email ?? "Famlo guest",
          userEmail: profile?.email ?? user.email ?? null,
          userPhone: profile?.phone ?? user.phone ?? null,
          userGender: profile?.gender ?? null,
          bookingId: activeConversation?.booking_id ?? null,
          subject: "Emergency assistance from guest chat",
          message:
            "The guest activated emergency mode from the Famlo message screen. Please review immediately. Live location will be shared for 1 hour.",
          emergency: true,
          location: coords,
          policeStationUrl: buildNearbySearchUrl("police", coords),
          hospitalUrl: buildNearbySearchUrl("hospital", coords),
          liveLocationEndsAt: new Date(endAt).toISOString(),
        }),
      });
      await updateEmergencyLocation(coords);
      setEmergencyCoords(coords);
    };

    const handlePosition = async (position: GeolocationPosition): Promise<void> => {
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setEmergencyCoords(coords);
      await updateEmergencyLocation(coords);
    };

    try {
      const initialCoords = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) =>
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          () => reject(new Error("Location access was denied.")),
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
        );
      });

      await sendEmergencyAlert(initialCoords);

      if (emergencyWatchRef.current != null) {
        navigator.geolocation.clearWatch(emergencyWatchRef.current);
      }
      emergencyWatchRef.current = navigator.geolocation.watchPosition(
        (position) => {
          void handlePosition(position);
        },
        () => {
          return;
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
      );

      if (emergencyStopTimerRef.current) window.clearTimeout(emergencyStopTimerRef.current);
      emergencyStopTimerRef.current = window.setTimeout(() => {
        if (emergencyWatchRef.current != null) {
          navigator.geolocation.clearWatch(emergencyWatchRef.current);
          emergencyWatchRef.current = null;
        }
        setEmergencyLive(false);
      }, 60 * 60 * 1000);
    } catch (locationError) {
      setEmergencyLive(false);
      setError(locationError instanceof Error ? locationError.message : "Could not start live location sharing.");
    }
  }, [activeConversation, activeConversationId, getAuthHeaders, profile?.email, profile?.gender, profile?.name, profile?.phone, updateEmergencyLocation, user]);

  function stopEmergencyLiveLocation(): void {
    if (emergencyWatchRef.current != null && typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(emergencyWatchRef.current);
      emergencyWatchRef.current = null;
    }
    if (emergencyStopTimerRef.current) window.clearTimeout(emergencyStopTimerRef.current);
    emergencyStopTimerRef.current = null;
    setEmergencyLive(false);
  }

  function handleDraftChange(value: string): void {
    setDraft(value);
    if (!user || !activeConversationId) return;
    if (!isTyping) setIsTyping(true);
    void updateTypingState(true);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      void updateTypingState(false);
      setIsTyping(false);
    }, 2200);
  }

  function handleDraftKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  if (loading || loadingConversations) {
    return (
      <main className="shell account-page-shell" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
        <section className="panel detail-box account-page-panel">
          <h1>Messages</h1>
          <p>Loading your Famlo conversations.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="shell account-page-shell" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
        <section className="panel detail-box account-page-panel">
          <h1>Messages</h1>
          <p>Sign in with your Famlo account to chat with hosts and guides.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell account-page-shell" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
      <section className="panel account-page-panel" style={{ padding: "clamp(20px, 4vw, 32px)", display: "grid", gap: 20 }}>
        <div className="account-page-header">
          <span className="eyebrow">Account</span>
          <h1 style={{ margin: "8px 0 0" }}>Messages</h1>
        </div>

        {error ? <div style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div> : null}

        <div className="account-messages-grid" style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)", gap: 20 }}>
          <aside className="panel detail-box" style={{ padding: 0, overflow: "hidden" }}>
            {conversations.length === 0 ? (
              <div style={{ padding: 20 }}>No conversations yet.</div>
            ) : (
              conversations.map((conversation) => {
                const hostName = conversation.host?.name ?? "Host";
                const propertyName = conversation.property_name ?? conversation.family?.name ?? "Famlo stay";
                const subtitle = [propertyName, [conversation.family?.city, conversation.family?.state].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" • ");

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setActiveConversationId(conversation.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: 18,
                      border: "none",
                      borderBottom: "1px solid #e2e8f0",
                      background: conversation.id === activeConversationId ? "#eff6ff" : "white",
                      cursor: "pointer",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 14, overflow: "hidden", background: "#eff6ff", border: "1px solid #dbeafe", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          {conversation.host_avatar_url || conversation.host?.avatar_url ? (
                            <img
                              src={conversation.host_avatar_url ?? conversation.host?.avatar_url ?? ""}
                              alt={hostName}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <span style={{ fontWeight: 900, color: "#165dcc" }}>{hostName.charAt(0)}</span>
                          )}
                        </div>
                        <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
                          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hostName}</strong>
                          <span style={{ color: "#64748b", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {[conversation.family?.city, conversation.family?.state].filter(Boolean).join(", ") || "Host profile"}
                          </span>
                        </div>
                      </div>
                      {conversation.guest_unread ? (
                        <span style={{ minWidth: 24, height: 24, borderRadius: 999, background: "#165dcc", color: "white", fontSize: 12, display: "grid", placeItems: "center" }}>
                          {conversation.guest_unread}
                        </span>
                      ) : null}
                    </div>
                    <span style={{ color: "#64748b", fontSize: 13 }}>{subtitle}</span>
                    <span style={{ color: "#334155", fontSize: 13, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                      {conversation.last_message || "Start your conversation"}
                    </span>
                  </button>
                );
              })
            )}
          </aside>

          <section className="panel detail-box" style={{ display: "grid", gap: 16, minHeight: 520 }}>
            {activeConversation ? (
              <>
                <div style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0, flex: "1 1 380px" }}>
                      <div style={{ width: 54, height: 54, borderRadius: 18, overflow: "hidden", background: "#eff6ff", border: "1px solid #dbeafe", display: "grid", placeItems: "center", flexShrink: 0 }}>
                        {hostAvatarUrl ? (
                          <img src={hostAvatarUrl} alt={hostDisplayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontWeight: 900, color: "#165dcc" }}>{(hostDisplayName ?? "H").charAt(0)}</span>
                        )}
                      </div>
                      <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                        <h2 style={{ margin: 0, lineHeight: 1.1 }}>{hostDisplayName}</h2>
                        <p style={{ margin: 0, color: "#165dcc", fontSize: 12, fontWeight: 800, letterSpacing: "0.02em" }}>
                          {propertyDisplayName}
                        </p>
                        {activeConversation.property_location || activeConversation.family?.city || activeConversation.family?.state ? (
                          <p style={{ margin: 0, color: "#64748b", fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>
                            {activeConversation.property_location ?? [activeConversation.family?.city, activeConversation.family?.state].filter(Boolean).join(", ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", flex: "0 1 auto" }}>
                      {hostLocationUrl ? (
                        <a
                          href={hostLocationUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open host location in Google Maps"
                          title={`Host Location · ${hostLocationLabel}`}
                          style={{
                            minHeight: 44,
                            padding: "0 16px",
                            borderRadius: 999,
                            display: "inline-flex",
                            gap: 8,
                            alignItems: "center",
                            border: "1px solid #bfdbfe",
                            background: "linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%)",
                            color: "#165dcc",
                            textDecoration: "none",
                            fontWeight: 900,
                            boxShadow: "0 10px 24px rgba(37, 99, 235, 0.08)",
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11z" />
                            <circle cx="12" cy="10" r="2.2" />
                          </svg>
                          <span>Host Location</span>
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setEmergencyOpen((current) => !current)}
                        style={{
                          minHeight: 44,
                          padding: "0 16px",
                          borderRadius: 999,
                          border: "1px solid #fca5a5",
                          background: emergencyOpen ? "linear-gradient(180deg, #fff1f2 0%, #fee2e2 100%)" : "linear-gradient(180deg, #fff7f7 0%, #ffe4e6 100%)",
                          color: "#b91c1c",
                          fontWeight: 900,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          boxShadow: "0 10px 24px rgba(185, 28, 28, 0.08)",
                        }}
                      >
                        Emergency
                      </button>
                    </div>
                  </div>
                  {isRecentlyTyping(activeConversation, user.id) ? (
                    <div style={{ marginTop: 10, color: "#165dcc", fontSize: 13, fontWeight: 800 }}>Host is typing...</div>
                  ) : null}
                  {emergencyOpen ? (
                    <div
                      style={{
                        marginTop: 14,
                        padding: 16,
                        borderRadius: 18,
                        border: "1px solid #fecaca",
                        background: "#fff7f7",
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "grid", gap: 6 }}>
                        <strong style={{ color: "#991b1b" }}>Emergency help</strong>
                        <p style={{ margin: 0, color: "#7f1d1d", lineHeight: 1.6 }}>
                          Share your live location for 1 hour with Famlo support, the team, and the founder. You can also call the police or jump to nearby police stations and hospitals.
                        </p>
                        {emergencyEndsAt ? (
                          <span style={{ fontSize: 12, color: "#991b1b", fontWeight: 700 }}>
                            Live location active until {formatTime(emergencyEndsAt)}
                          </span>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => void startEmergencyLiveLocation()}
                          disabled={emergencyLive}
                          style={{
                            minHeight: 42,
                            padding: "0 14px",
                            borderRadius: 999,
                            border: "1px solid #fca5a5",
                            background: emergencyLive ? "#fee2e2" : "#dc2626",
                            color: "white",
                            fontWeight: 900,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {emergencyLive ? "Live location shared" : "Share live location for 1 hour"}
                        </button>
                        <a
                          href="tel:112"
                          style={{
                            minHeight: 42,
                            padding: "0 14px",
                            borderRadius: 999,
                            border: "1px solid #fca5a5",
                            background: "white",
                            color: "#be123c",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            fontWeight: 900,
                          }}
                        >
                          Call police
                        </a>
                        {emergencyPoliceUrl ? (
                          <a
                            href={emergencyPoliceUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              minHeight: 42,
                              padding: "0 14px",
                              borderRadius: 999,
                              border: "1px solid #fca5a5",
                              background: "white",
                              color: "#be123c",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              fontWeight: 900,
                            }}
                          >
                            Nearby police station
                          </a>
                        ) : null}
                        {emergencyHospitalUrl ? (
                          <a
                            href={emergencyHospitalUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              minHeight: 42,
                              padding: "0 14px",
                              borderRadius: 999,
                              border: "1px solid #fca5a5",
                              background: "white",
                              color: "#be123c",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              fontWeight: 900,
                            }}
                          >
                            Nearby hospital
                          </a>
                        ) : null}
                      </div>
                      {emergencyLive ? (
                        <button
                          type="button"
                          onClick={stopEmergencyLiveLocation}
                          style={{
                            width: "fit-content",
                            border: "none",
                            background: "transparent",
                            color: "#991b1b",
                            fontWeight: 800,
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          Stop live location now
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div ref={threadRef} className="account-message-thread" style={{ display: "grid", gap: 12, alignContent: "start", minHeight: 320, maxHeight: 460, overflowY: "auto", paddingRight: 4 }}>
                  {loadingMessages ? <p>Loading messages...</p> : null}
                  {!loadingMessages && messages.length === 0 ? <p>No messages yet.</p> : null}
                  {messages.map((message) => {
                    const mine = message.sender_id === user.id;
                    const isSystem = message.sender_type === "system";
                    const isDeleted = Boolean(message.deleted_at);
                    const isImage = Boolean(message.image_url) && !isDeleted;
                    const mapsUrl = extractMapsUrl(message.text || message.content || "");

                    if (isSystem) {
                      return (
                        <div key={message.id} style={{ display: "flex", justifyContent: "center" }}>
                          <div
                            style={{
                              maxWidth: "78%",
                              padding: "12px 14px",
                              borderRadius: 18,
                              background: "#eff6ff",
                              border: "1px solid #bfdbfe",
                              color: "#1d4ed8",
                              fontWeight: 700,
                              display: "grid",
                              gap: 6,
                            }}
                          >
                            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{message.text || message.content || ""}</div>
                            {mapsUrl ? (
                              <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", fontWeight: 800, color: "#1d4ed8", width: "fit-content" }}>
                                Open map
                              </a>
                            ) : null}
                            <div style={{ fontSize: 11, opacity: 0.8, lineHeight: 1.2 }}>{formatTime(message.created_at)}</div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={message.id}
                        style={{
                          justifySelf: mine ? "end" : "start",
                          maxWidth: "76%",
                          padding: "12px 14px",
                          borderRadius: 18,
                          background: mine ? "#165dcc" : "#f8fafc",
                          color: mine ? "white" : "#0f172a",
                          boxShadow: mine ? "0 12px 24px rgba(22,93,204,0.18)" : "inset 0 0 0 1px #e2e8f0",
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        {isImage ? (
                          <a href={message.image_url as string} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: message.text || message.content ? 8 : 0 }}>
                            <img
                              src={message.image_url as string}
                              alt={message.image_name || "Chat attachment"}
                              style={{
                                width: "100%",
                                maxWidth: 280,
                                display: "block",
                                borderRadius: 14,
                                objectFit: "cover",
                                border: mine ? "1px solid rgba(255,255,255,0.24)" : "1px solid #e2e8f0",
                              }}
                            />
                          </a>
                        ) : null}
                        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                          {isDeleted ? "Message deleted" : (message.text || message.content || "")}
                        </div>
                        {mapsUrl ? (
                          <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", fontWeight: 800, color: mine ? "#dbeafe" : "#1d4ed8", width: "fit-content" }}>
                            Open map
                          </a>
                        ) : null}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, opacity: 0.75, lineHeight: 1.2 }}>
                          <span>{message.pending ? "Sending..." : formatTime(message.created_at)}</span>
                          {mine ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 800 }}>
                              <span>{message.seen_at ? "✓✓" : "✓"}</span>
                              <span>{message.seen_at ? "Read" : "Delivered"}</span>
                            </span>
                          ) : null}
                        </div>
                        {mine && !message.pending && !isDeleted ? (
                          <button
                            type="button"
                            onClick={() => void deleteMessage(message.id)}
                            disabled={deletingMessageId === message.id}
                            style={{
                              marginTop: 8,
                              border: "none",
                              background: "transparent",
                              color: mine ? "#dbeafe" : "#1d4ed8",
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            {deletingMessageId === message.id ? "Deleting..." : "Delete"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="account-message-compose" style={{ display: "grid", gap: 10 }}>
                  <div className="account-message-actions-row" style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "nowrap" }}>
                    <textarea
                      className="text-input"
                      rows={1}
                      value={draft}
                      onChange={(event) => handleDraftChange(event.target.value)}
                      onKeyDown={handleDraftKeyDown}
                      placeholder="Message your host"
                      style={{
                        flex: 1,
                        resize: "none",
                        minHeight: 48,
                        height: 48,
                        borderRadius: 999,
                        padding: "12px 16px",
                        lineHeight: 1.2,
                        alignSelf: "stretch",
                        caretColor: "#165dcc",
                        boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.04)",
                      }}
                    />
                    <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={uploadingImage}
                        aria-label="Attach photo"
                        title="Attach photo"
                        className="account-message-location-button"
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: "50%",
                          border: "1px solid #bfdbfe",
                          background: "#eff6ff",
                          color: "#165dcc",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          cursor: "pointer",
                          fontSize: 16,
                        }}
                      >
                        {uploadingImage ? "…" : "＋"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void shareLocationInChat()}
                        disabled={sharingLocation}
                        aria-label="Share location"
                        className="account-message-location-button"
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: "50%",
                          border: "1px solid #bfdbfe",
                          background: "#eff6ff",
                          color: "#165dcc",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          cursor: "pointer",
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11z" />
                          <circle cx="12" cy="10" r="2.2" />
                        </svg>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={sending || draft.trim().length === 0}
                      className="account-message-send-button"
                      style={{
                        width: 112,
                        minHeight: 48,
                        height: 48,
                        borderRadius: 999,
                        border: "none",
                        background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                        color: "white",
                        fontWeight: 900,
                        cursor: "pointer",
                        alignSelf: "stretch",
                      }}
                    >
                      {sending ? "..." : "Send"}
                    </button>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) => void handleImagePick(event)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p>Select a conversation to open messages.</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
