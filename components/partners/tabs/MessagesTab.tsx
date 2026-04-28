"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, CheckCheck, Loader2, MessageSquare, Search, Send, User, MapPin, Trash2 } from "lucide-react";

import { createBrowserSupabaseClient } from "@/lib/supabase";

import styles from "../dashboard.module.css";

function extractMapsUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/maps\.google\.com\/\?q=[^\s]+/i);
  return match ? match[0] : null;
}

function isRecentlyTyping(conversation: any, currentUserId: string): boolean {
  if (!conversation?.typing_user_id || conversation.typing_user_id === currentUserId || !conversation.typing_updated_at) return false;
  const age = Date.now() - new Date(conversation.typing_updated_at).getTime();
  return Number.isFinite(age) && age >= 0 && age < 7000;
}

function mergeMessages(current: any[], incoming: any): any[] {
  if (current.some((message) => message.id === incoming.id)) {
    return current.map((message) => (message.id === incoming.id ? { ...message, ...incoming, pending: false } : message));
  }

  const withoutTemp = current.filter(
    (message) =>
      !message.pending ||
      (message.text || message.content || "").trim() !== (incoming.text || incoming.content || "").trim()
  );

  return [...withoutTemp, { ...incoming, text: incoming.content || incoming.text || "", pending: false }].sort(
    (left, right) => new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime()
  );
}

interface MessagesTabProps {
  familyId: string;
  hostUserId: string;
  activeFamily: any;
  initialConversationId?: string | null;
  setActiveConversationId: (id: string | null) => void;
}

export default function MessagesTab({
  familyId,
  hostUserId,
  activeFamily,
  initialConversationId,
  setActiveConversationId,
}: MessagesTabProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConversationId || null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number | null>(null);
  const activeConversationLastMessageAtRef = useRef<string | null>(null);
  const authRefreshAttemptedRef = useRef(false);
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConvId) ?? null,
    [activeConvId, conversations]
  );

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
    return headers;
  }, [supabase]);

  const fetchConversations = useCallback(async (preserveSelection = true): Promise<any[]> => {
    if (!familyId || !hostUserId) return [];
    try {
      const response = await fetch(`/api/host/conversations?familyId=${familyId}&hostUserId=${hostUserId}`, {
        headers: await getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to load conversations.");
      }
      setConversations(data);
      if ((!preserveSelection || !activeConvId) && data[0]?.id) {
        setActiveConvId(data[0].id);
      } else if (activeConvId && !data.some((conversation: any) => conversation.id === activeConvId)) {
        setActiveConvId(data[0]?.id ?? null);
      }
      return data;
    } catch (err) {
      console.error("Fetch conversations error:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [activeConvId, familyId, getAuthHeaders, hostUserId]);

  const fetchMessages = useCallback(async (conversationId: string, silent = false) => {
    if (!silent) setLoadingMessages(true);
    try {
      const response = await fetch(`/api/host/messages?conversationId=${conversationId}&limit=50`, {
        headers: await getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to load messages.");
      }
      setMessages((data ?? []).map((message: any) => ({ ...message, text: message.content || message.text || "" })));
      activeConversationLastMessageAtRef.current = data?.length > 0 ? data[data.length - 1]?.created_at ?? activeConversationLastMessageAtRef.current : activeConversationLastMessageAtRef.current;
    } catch (err) {
      console.error("Fetch messages error:", err);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, [getAuthHeaders]);

  const fetchActiveConversationStatus = useCallback(async (conversationId: string): Promise<string | null> => {
    if (!familyId || !hostUserId) return null;
    try {
      const response = await fetch(`/api/host/conversations?familyId=${familyId}&hostUserId=${hostUserId}&conversationId=${conversationId}&lightweight=1`, {
        headers: await getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to load conversation status.");
      }
      return data?.[0]?.last_message_at ?? null;
    } catch (err) {
      console.error("Fetch conversation status error:", err);
      return null;
    }
  }, [familyId, getAuthHeaders, hostUserId]);

  useEffect(() => {
    setActiveConvId(initialConversationId || null);
  }, [initialConversationId]);

  useEffect(() => {
    setActiveConversationId(activeConvId);
  }, [activeConvId, setActiveConversationId]);

  useEffect(() => {
    activeConversationLastMessageAtRef.current = activeConversation?.last_message_at ?? null;
  }, [activeConversation?.last_message_at, activeConvId]);

  useEffect(() => {
    void fetchConversations(false);
  }, [fetchConversations]);

  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    void fetchMessages(activeConvId);
  }, [activeConvId, fetchMessages]);

  useEffect(() => {
    const channel = supabase
      .channel(`host-conversations-${hostUserId}-${familyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `host_user_id=eq.${hostUserId}`,
        },
        () => {
          void fetchConversations(true);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [familyId, fetchConversations, hostUserId, supabase]);

  useEffect(() => {
    if (!activeConvId) return;

    const channel = supabase
      .channel(`host-messages-${activeConvId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConvId}`,
        },
        (payload) => {
          const nextMessage = payload.new as any;
          if (nextMessage?.id) {
            setMessages((current) => mergeMessages(current, nextMessage));
          }
        }
      )
      .subscribe();

    const interval = window.setInterval(() => {
      void (async () => {
        const latestLastMessageAt = await fetchActiveConversationStatus(activeConvId);
        if (latestLastMessageAt && latestLastMessageAt !== activeConversationLastMessageAtRef.current) {
          activeConversationLastMessageAtRef.current = latestLastMessageAt;
          await fetchMessages(activeConvId, true);
        }
      })();
    }, 4000);

    const onFocus = () => {
      void fetchConversations(true);
      void (async () => {
        const latestLastMessageAt = await fetchActiveConversationStatus(activeConvId);
        if (latestLastMessageAt && latestLastMessageAt !== activeConversationLastMessageAtRef.current) {
          activeConversationLastMessageAtRef.current = latestLastMessageAt;
          await fetchMessages(activeConvId, true);
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
  }, [activeConvId, fetchActiveConversationStatus, fetchConversations, fetchMessages, supabase]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    };
  }, []);

  const updateTypingState = useCallback(async (nextTyping: boolean) => {
    if (!activeConvId || !hostUserId) return;
    try {
      await fetch("/api/conversations/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          userId: hostUserId,
          isTyping: nextTyping,
        }),
      });
    } catch {
      return;
    }
  }, [activeConvId, hostUserId]);

  const handleSendMessage = useCallback(async (event?: React.FormEvent, options?: { text?: string; messageType?: "text" | "location" }) => {
    event?.preventDefault();
    const textValue = options?.text ?? newMessage;
    if (!activeConvId || !textValue.trim() || sending) return;

    const activeConversation = conversations.find((conversation) => conversation.id === activeConvId);
    const trimmed = textValue.trim();
    const optimisticId = `temp-${Date.now()}`;

    setSending(true);
    setSendError(null);
    setMessages((current) => [
      ...current,
      {
        id: optimisticId,
        sender_id: hostUserId,
        receiver_id: activeConversation?.guest_id ?? null,
        sender_type: "host",
        message_type: options?.messageType ?? "text",
        text: trimmed,
        content: trimmed,
        created_at: new Date().toISOString(),
        pending: true,
      },
    ]);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeConvId
          ? { ...conversation, last_message: trimmed, last_message_at: new Date().toISOString(), host_unread: 0 }
          : conversation
      )
    );

    try {
      const response = await fetch("/api/host/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          conversationId: activeConvId,
          bookingId: activeConversation?.booking_id ?? null,
          senderId: hostUserId,
          receiverId: activeConversation?.guest_id ?? null,
          text: trimmed,
          messageType: options?.messageType ?? "text",
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to send message.");
      }

      setMessages((current) =>
        mergeMessages(current.filter((message) => message.id !== optimisticId), payload)
      );
      activeConversationLastMessageAtRef.current = typeof payload?.created_at === "string" ? payload.created_at : activeConversationLastMessageAtRef.current;
      if (!options?.text) {
        setNewMessage("");
      }
      setIsTyping(false);
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      void updateTypingState(false);
    } catch (err) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      console.error("Send error:", err);
      setSendError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  }, [activeConvId, conversations, getAuthHeaders, hostUserId, newMessage, sending, updateTypingState]);

  const shareLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setSendError("Location sharing is not available on this device.");
      return;
    }

    setSharingLocation(true);
    setSendError(null);

    try {
      const coords = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
          () => reject(new Error("Location access was denied.")),
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
        );
      });

      await handleSendMessage(undefined, {
        text: `Shared location: https://maps.google.com/?q=${coords.lat},${coords.lng}`,
        messageType: "location",
      });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Could not share location.");
    } finally {
      setSharingLocation(false);
    }
  }, [handleSendMessage]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!activeConvId || !hostUserId) return;
    const confirmed = window.confirm("Delete this message?");
    if (!confirmed) return;

    setDeletingMessageId(messageId);
    setSendError(null);

    try {
      const response = await fetch("/api/host/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          conversationId: activeConvId,
          bookingId: activeConversation?.booking_id ?? null,
          messageId,
          senderId: hostUserId,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to delete message.");
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                deleted_at: new Date().toISOString(),
                deleted_by: hostUserId,
                message_type: "deleted",
                text: "Message deleted",
                content: "Message deleted",
                image_url: null,
                image_name: null,
              }
            : message
        )
      );
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to delete message.");
    } finally {
      setDeletingMessageId(null);
    }
  }, [activeConvId, activeConversation?.booking_id, getAuthHeaders, hostUserId]);

  const handleDraftChange = useCallback((value: string) => {
    setNewMessage(value);
    if (!isTyping) setIsTyping(true);
    void updateTypingState(true);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      void updateTypingState(false);
      setIsTyping(false);
    }, 2200);
  }, [isTyping, updateTypingState]);

  const handleDraftKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  }, [handleSendMessage]);

  if (loading && conversations.length === 0) {
    return (
      <div style={{ display: "flex", height: "600px", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className={styles.spin} size={40} color="#165dcc" />
      </div>
    );
  }

  return (
    <div className={styles.chatLayout}>
      <div className={`${styles.chatSidebar} ${activeConvId ? styles.sidebarHiddenOnMobile : ""}`}>
        <div style={{ padding: "20px", borderBottom: "1px solid #f1f5f9" }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 900, color: "#0e2b57" }}>Messages</h3>
          <div style={{ position: "relative", marginTop: "16px" }}>
            <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Search guests..."
              style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "13px", background: "#f8fafc" }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {conversations.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#94a3b8" }}>
              <MessageSquare size={32} style={{ marginBottom: "12px", opacity: 0.3 }} />
              <p style={{ fontSize: "13px", fontWeight: 600 }}>No conversations found for this listing yet.</p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => setActiveConvId(conversation.id)}
                className={`${styles.chatThreadItem} ${activeConvId === conversation.id ? styles.activeThread : ""}`}
              >
                <div style={{ position: "relative" }}>
                  {conversation.guest?.avatar_url ? (
                    <img src={conversation.guest.avatar_url} className={styles.chatAvatar} alt="" />
                  ) : (
                    <div className={styles.chatAvatarFallback}><User size={18} /></div>
                  )}
                  {conversation.host_unread > 0 ? <div className={styles.unreadDot} /> : null}
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                    <span style={{ fontWeight: 800, fontSize: "14px", color: "#0e2b57" }}>{conversation.guest?.name || "Guest"}</span>
                    <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700 }}>
                      {conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "rgba(14,43,87,0.5)", fontWeight: 700, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                    {conversation.last_message || "Start a conversation..."}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`${styles.chatWindow} ${!activeConvId ? styles.windowHiddenOnMobile : ""}`}>
        {activeConversation ? (
          <>
            <div className={styles.chatHeader}>
              <button className={styles.backBtn} onClick={() => setActiveConvId(null)}><ChevronLeft size={20} /></button>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#f4f8ff", color: "#165dcc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {activeConversation.guest?.avatar_url ? (
                    <img src={activeConversation.guest.avatar_url} alt={activeConversation.guest?.name || "Guest"} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                  ) : (
                    <User size={20} />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 900, color: "#0e2b57", fontSize: "15px" }}>
                    {activeConversation.guest?.name || "Guest"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#10b981", fontWeight: 800 }}>
                    {activeFamily?.property_name || activeFamily?.name || "Famlo stay"}
                  </div>
                  {activeConversation.guest?.city || activeConversation.guest?.state ? (
                    <div style={{ fontSize: "11px", color: "rgba(14,43,87,0.5)", fontWeight: 700, marginTop: "2px" }}>
                      {[activeConversation.guest?.city, activeConversation.guest?.state].filter(Boolean).join(", ")}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className={styles.chatBody} ref={scrollRef}>
              {isRecentlyTyping(activeConversation, hostUserId) ? (
                <div style={{ display: "flex", justifyContent: "center", margin: "10px 0 0" }}>
                  <div style={{ padding: "8px 12px", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8", fontSize: 12, fontWeight: 800 }}>
                    Guest is typing...
                  </div>
                </div>
              ) : null}
              {sendError ? (
                <div style={{ display: "flex", justifyContent: "center", margin: "12px 16px 0" }}>
                  <div
                    style={{
                      maxWidth: "80%",
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                      borderRadius: "14px",
                      padding: "10px 14px",
                      color: "#be123c",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    {sendError}
                  </div>
                </div>
              ) : null}
              {loadingMessages ? (
                <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
                  <Loader2 className={styles.spin} size={24} color="#94a3b8" />
                </div>
              ) : (
                <>
                  <div style={{ textAlign: "center", margin: "20px 0" }}>
                    <div style={{ display: "inline-block", background: "#f8fafc", padding: "6px 12px", borderRadius: "12px", fontSize: "10px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                      Conversation Started
                    </div>
                  </div>
                  {messages.map((message) => {
                    const isMe = message.sender_type === "host";
                    const isSystem = message.sender_type === "system";
                    const isDeleted = Boolean(message.deleted_at);
                    const isImage = Boolean(message.image_url) && !isDeleted;
                    const mapsUrl = extractMapsUrl(message.text || message.content || "");

                    if (isSystem) {
                      return (
                        <div key={message.id} style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
                          <div
                            style={{
                              maxWidth: "80%",
                              background: "#eff6ff",
                              border: "1px solid #bfdbfe",
                              borderRadius: "14px",
                              padding: "12px 16px",
                              color: "#1d4ed8",
                              fontSize: "13px",
                              fontWeight: 700,
                              lineHeight: 1.5,
                              textAlign: "center",
                            }}
                          >
                            {message.text}
                            {mapsUrl ? (
                              <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", marginTop: 8, color: "#1d4ed8", fontWeight: 800 }}>
                                Open map
                              </a>
                            ) : null}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={message.id} className={`${styles.messageRow} ${isMe ? styles.messageMe : styles.messageThem}`}>
                        <div className={styles.messageBubble}>
                          {isImage ? (
                            <a href={message.image_url} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: message.text ? 8 : 0 }}>
                              <img
                                src={message.image_url}
                                alt={message.image_name || "Chat attachment"}
                                style={{ width: "100%", maxWidth: 280, display: "block", borderRadius: 14, objectFit: "cover" }}
                              />
                            </a>
                          ) : null}
                          <div>{isDeleted ? "Message deleted" : message.text}</div>
                          {mapsUrl ? (
                            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", marginTop: 8, color: isMe ? "#dbeafe" : "#1d4ed8", fontWeight: 800 }}>
                              Open map
                            </a>
                          ) : null}
                          <div className={styles.messageMeta}>
                            <span>{message.pending ? "Sending..." : new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            {isMe ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
                                <CheckCheck size={12} />
                                <span>{message.seen_at ? "Read" : "Delivered"}</span>
                              </span>
                            ) : null}
                          </div>
                          {isMe && !message.pending && !isDeleted ? (
                            <button
                              type="button"
                              onClick={() => void deleteMessage(message.id)}
                              disabled={deletingMessageId === message.id}
                              style={{
                                marginTop: 8,
                                border: "none",
                                background: "transparent",
                                color: isMe ? "#dbeafe" : "#1d4ed8",
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
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <form className={styles.chatInput} onSubmit={handleSendMessage}>
              <button type="button" onClick={() => void shareLocation()} disabled={sharingLocation} aria-label="Share location" title="Share location" style={{ background: "#eff6ff", color: "#165dcc" }}>
                <MapPin size={18} />
              </button>
              <input
                type="text"
                placeholder="Type your message..."
                value={newMessage}
                onChange={(event) => handleDraftChange(event.target.value)}
                onKeyDown={handleDraftKeyDown}
                disabled={sending}
              />
              <button type="submit" disabled={!newMessage.trim() || sending} style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "white" }}>
                {sending ? <Loader2 className={styles.spin} size={18} /> : <Send size={18} />}
              </button>
            </form>
          </>
        ) : (
          <div className={styles.noChatSelected}>
            <div className={styles.noChatIcon}><MessageSquare size={48} /></div>
            <h3>Select a conversation</h3>
            <p>Pick a guest from the left to view messages and history.</p>
          </div>
        )}
      </div>
    </div>
  );
}
