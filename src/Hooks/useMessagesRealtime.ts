import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "@context/AuthContext";
import { fetchConversations, messageReceived, selectTotalUnread } from "@store/slices/messagesSlice";

import { setUnreadBadge } from "@/lib/appBadge";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { supabase } from "@/lib/supabase.js";
import type { Message } from "@/models/globalTypes";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

const UUID_RE = /^[0-9a-f-]{36}$/i;

// Keeps an open tab's conversation list + threads live. Only messages sent *to*
// the signed-in user come over the wire — their own sends round-trip through the
// sendMessage thunk. Mirrors useSessionsRealtime.
export function useMessagesRealtime() {
  const { authUser, isDemo } = useAuth();
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  const knownIds = useAppSelector((s) => s.messages.conversations.map((c) => c.id).join(","));
  const totalUnread = useAppSelector(selectTotalUnread);
  const messagingOn = isFeatureEnabled("messaging");

  // Mirror the unread count onto the tab title / favicon / PWA app icon.
  useEffect(() => {
    if (messagingOn) setUnreadBadge(totalUnread);
  }, [messagingOn, totalUnread]);

  // Read the latest route + known-ids from inside the subscription callback
  // without making them subscription dependencies (they change on every nav).
  const pathnameRef = useRef(pathname);
  const knownIdsRef = useRef(knownIds);
  pathnameRef.current = pathname;
  knownIdsRef.current = knownIds;

  useEffect(() => {
    if (!authUser || !isFeatureEnabled("messaging")) return;
    // Demo accounts never touch the real messages table or realtime — the
    // scripted conversation is seeded by MessagesView / ChatWidget instead.
    if (isDemo) return;

    // Prime the list once so the nav unread badge is right on load.
    dispatch(fetchConversations());

    const channel = supabase
      .channel(`messages-realtime:${authUser.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${authUser.id}` },
        (payload) => {
          const message = payload.new as Message;
          const lastSeg = pathnameRef.current.split("/").filter(Boolean).pop() ?? "";
          const activeConversationId = UUID_RE.test(lastSeg) ? lastSeg : null;

          dispatch(messageReceived({ message, activeConversationId }));
          if (!knownIdsRef.current.split(",").includes(message.conversation_id)) {
            dispatch(fetchConversations());
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUser, isDemo, dispatch]);
}
