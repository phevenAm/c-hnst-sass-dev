import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { pickColor } from "@Helpers/Helpers";
import MessageComposer from "@components/messaging/MessageComposer/MessageComposer";
import MessageThread from "@components/messaging/MessageThread/MessageThread";
import MessagingNotice from "@components/messaging/MessagingNotice/MessagingNotice";
import Avatar from "@components/shared/Avatar/Avatar";
import Button from "@components/shared/Button/Button";
import CountBadge from "@components/shared/CountBadge/CountBadge";
import { ChatIcon, ChevronDown, ChevronDownSmIcon, CloseIcon } from "@components/shared/Icons/Icons";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  demoDataLoaded,
  demoMessageSent,
  fetchConversations,
  fetchThread,
  markConversationRead,
  openConversation,
  selectConversationById,
  selectConversations,
  selectConversationsStatus,
  selectThread,
  selectThreadStatus,
  selectTotalUnread,
  sendMessage,
} from "@store/slices/messagesSlice";

import { isFeatureEnabled } from "@/lib/featureFlags";

import styles from "./ChatWidget.module.scss";

const MOBILE_Q = "(max-width: 720px)";
const LS_KEY = "chat_widget";

type WidgetState = { open: boolean; minimised: boolean; activeId: string | null };

const readState = (): WidgetState => {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? "");
    return { open: !!raw.open, minimised: !!raw.minimised, activeId: raw.activeId ?? null };
  } catch {
    return { open: false, minimised: false, activeId: null };
  }
};

const peerName = (p: { first_name: string | null; last_name: string | null; display_name: string | null }) =>
  p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Someone";

/**
 * A floating chat panel, bottom-right, on every authenticated page. Reads/replies
 * to existing threads; starting a new one hands off to the full /messages page
 * (or, for a client with no thread yet, one click). Mobile shows only the button,
 * which navigates to the full page. Hidden on the full page itself.
 */
export default function ChatWidget() {
  const { authUser, isAdmin, userProfile, isDemo, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_Q).matches);
  const [{ open, minimised, activeId }, setState] = useState<WidgetState>(readState);

  const conversations = useAppSelector(selectConversations);
  const conversationsStatus = useAppSelector(selectConversationsStatus);
  const totalUnread = useAppSelector(selectTotalUnread);
  const activeConvo = useAppSelector(selectConversationById(activeId ?? ""));
  const thread = useAppSelector(selectThread(activeId ?? ""));
  const threadStatus = useAppSelector(selectThreadStatus(activeId ?? ""));

  const fullPath = isAdmin ? "/admin/messages" : "/messages";
  const onFullPage = pathname.startsWith(fullPath);
  const myId = authUser?.id ?? "";

  const patch = (p: Partial<WidgetState>) =>
    setState((s) => {
      const next = { ...s, ...p };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_Q);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    // authLoading gate: isDemo is false until userProfile loads; without this
    // the real fetch can fire first and block the demo seed (see MessagesView).
    if (!open || isMobile || authLoading || conversationsStatus !== "idle") return;
    // Demo accounts get a scripted, in-memory conversation — never the real table.
    if (isDemo) dispatch(demoDataLoaded(myId));
    else dispatch(fetchConversations());
  }, [open, isMobile, authLoading, conversationsStatus, isDemo, myId, dispatch]);

  useEffect(() => {
    if (!open || isMobile || !activeId || isDemo) return;
    dispatch(fetchThread(activeId));
    dispatch(markConversationRead(activeId));
  }, [open, isMobile, activeId, isDemo, dispatch]);

  useEffect(() => {
    if (!isDemo && activeId && thread.some((m) => m.recipient_id === myId && !m.read_at)) {
      dispatch(markConversationRead(activeId));
    }
  }, [activeId, thread, myId, isDemo, dispatch]);

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at)),
    [conversations],
  );

  const clientAdminId = userProfile?.admin_id ?? null;
  const renderEmpty = () => {
    if (isAdmin) return <p className={styles.hint}>No conversations yet.</p>;
    if (!clientAdminId)
      return <p className={styles.hint}>You'll be able to message your counsellor once you have one.</p>;
    return (
      <Button
        size="sm"
        onClick={async () => {
          const res = await dispatch(openConversation({ adminId: clientAdminId, clientId: myId }));
          if (typeof res.payload === "string") patch({ activeId: res.payload });
        }}
      >
        Message your counsellor
      </Button>
    );
  };

  if (!authUser || !isFeatureEnabled("messaging") || onFullPage) return null;

  // ── Mobile / closed: just the button ──────────────────────────────────────
  const launcher = (
    <button
      type="button"
      className={styles.fab}
      aria-label={totalUnread > 0 ? `Messages, ${totalUnread} unread` : "Messages"}
      onClick={() => (isMobile ? navigate(fullPath) : patch({ open: true, minimised: false }))}
    >
      <ChatIcon />
      <CountBadge count={totalUnread} className={styles.fabBadge} />
    </button>
  );

  if (isMobile || !open) return <div className={styles.root}>{launcher}</div>;

  // ── Minimised bar ────────────────────────────────────────────────────────
  if (minimised) {
    return (
      <div className={styles.root}>
        <button type="button" className={styles.minBar} onClick={() => patch({ minimised: false })}>
          <span className={styles.minTitle}>Messages</span>
          <CountBadge count={totalUnread} />
          <span className={styles.minActions}>
            <ChevronDown />
          </span>
        </button>
      </div>
    );
  }

  // ── Open panel ───────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      <div className={styles.panel} role="dialog" aria-label="Messages">
        <header className={styles.head}>
          {activeConvo ? (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => patch({ activeId: null })}
              aria-label="Back to conversations"
            >
              <ChevronDownSmIcon />
            </button>
          ) : null}
          <span className={styles.headTitle}>{activeConvo ? peerName(activeConvo.peer) : "Messages"}</span>
          <span className={styles.headActions}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => navigate(activeId ? `${fullPath}/${activeId}` : fullPath)}
              aria-label="Open full page"
              title="Open full page"
            >
              ⤢
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => patch({ minimised: true })}
              aria-label="Minimise"
            >
              <ChevronDown />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => patch({ open: false, activeId: null })}
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </span>
        </header>

        {activeConvo ? (
          <>
            <MessageThread messages={thread} myId={myId} loading={threadStatus === "loading"} />
            <MessageComposer
              onSend={(body) => {
                if (isDemo) {
                  dispatch(
                    demoMessageSent({
                      conversationId: activeConvo.id,
                      senderId: myId,
                      recipientId: activeConvo.peer.id,
                      body,
                    }),
                  );
                  showToast("Demo mode — messages aren't sent or saved.");
                  return;
                }
                dispatch(sendMessage({ conversationId: activeConvo.id, recipientId: activeConvo.peer.id, body }));
              }}
            />
          </>
        ) : (
          <div className={styles.list}>
            <MessagingNotice audience={isAdmin ? "admin" : "client"} />

            {conversationsStatus === "loading" && sorted.length === 0 && <p className={styles.hint}>Loading…</p>}

            {conversationsStatus !== "loading" && sorted.length === 0 && (
              <div className={styles.empty}>{renderEmpty()}</div>
            )}

            {sorted.map((c) => (
              <button key={c.id} type="button" className={styles.convo} onClick={() => patch({ activeId: c.id })}>
                <Avatar
                  name={peerName(c.peer)}
                  color={pickColor(c.peer.id)}
                  size={32}
                  imageSrc={c.peer.avatar_url || ""}
                />
                <span className={styles.convoBody}>
                  <span className={styles.convoName}>{peerName(c.peer)}</span>
                  <span className={styles.convoPreview}>{c.last_message ?? "No messages yet"}</span>
                </span>
                <CountBadge count={c.unread} max={99} />
              </button>
            ))}

            {sorted.length > 0 && (
              <button type="button" className={styles.fullLink} onClick={() => navigate(fullPath)}>
                Open messages →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
