import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { pickColor } from "@Helpers/Helpers";
import Avatar from "@components/shared/Avatar/Avatar";
import Button from "@components/shared/Button/Button";
import { ChevronLeftIcon } from "@components/shared/Icons/Icons";
import { useAuth } from "@context/AuthContext";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchConversations,
  fetchThread,
  markConversationRead,
  openConversation,
  selectConversationById,
  selectConversations,
  selectConversationsStatus,
  selectThread,
  selectThreadStatus,
  sendMessage,
} from "@store/slices/messagesSlice";
import { fetchAllUsers, selectClientUsers } from "@store/slices/userDirectorySlice";

import styles from "./MessagesView.module.scss";

type Props = {
  /** Route prefix these links sit under — "/messages" or "/admin/messages". */
  basePath: string;
  audience: "admin" | "client";
};

const peerName = (p: { first_name: string | null; last_name: string | null; display_name: string | null }) =>
  p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Someone";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString();
}

export default function MessagesView({ basePath, audience }: Props) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  const { authUser, userProfile } = useAuth();
  const myId = authUser?.id ?? "";

  const conversations = useAppSelector(selectConversations);
  const conversationsStatus = useAppSelector(selectConversationsStatus);
  const activeConvo = useAppSelector(selectConversationById(conversationId ?? ""));
  const thread = useAppSelector(selectThread(conversationId ?? ""));
  const threadStatus = useAppSelector(selectThreadStatus(conversationId ?? ""));

  useEffect(() => {
    if (conversationsStatus === "idle") dispatch(fetchConversations());
  }, [conversationsStatus, dispatch]);

  useEffect(() => {
    if (!conversationId) return;
    dispatch(fetchThread(conversationId));
    dispatch(markConversationRead(conversationId));
  }, [conversationId, dispatch]);

  // Mark read again once messages land (covers arriving via realtime while open).
  useEffect(() => {
    if (conversationId && thread.some((m) => m.recipient_id === myId && !m.read_at)) {
      dispatch(markConversationRead(conversationId));
    }
  }, [conversationId, thread, myId, dispatch]);

  return (
    <div className={styles.wrap} id="messages-view">
      <aside className={`${styles.list} ${conversationId ? styles.listHiddenMobile : ""}`}>
        <div className={styles.listHead}>
          <h1 className={styles.title}>Messages</h1>
          {audience === "admin" && <NewMessagePicker basePath={basePath} myId={myId} />}
        </div>

        {conversationsStatus === "loading" && conversations.length === 0 && <p className={styles.hint}>Loading…</p>}

        {conversationsStatus !== "loading" && conversations.length === 0 && (
          <EmptyList audience={audience} adminId={userProfile?.admin_id ?? null} myId={myId} basePath={basePath} />
        )}

        <ul className={styles.convos}>
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                to={`${basePath}/${c.id}`}
                className={`${styles.convo} ${c.id === conversationId ? styles.convoActive : ""}`}
              >
                <Avatar
                  name={peerName(c.peer)}
                  color={pickColor(c.peer.id)}
                  size={40}
                  imageSrc={c.peer.avatar_url || ""}
                />
                <div className={styles.convoBody}>
                  <div className={styles.convoTop}>
                    <span className={styles.convoName}>{peerName(c.peer)}</span>
                    <span className={styles.convoTime}>{relTime(c.last_message_at)}</span>
                  </div>
                  <div className={styles.convoPreview}>
                    <span>{c.last_message ?? "No messages yet"}</span>
                    {c.unread > 0 && <span className={styles.badge}>{c.unread}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className={`${styles.pane} ${conversationId ? "" : styles.paneHiddenMobile}`}>
        {!conversationId && <div className={styles.placeholder}>Pick a conversation to start reading.</div>}

        {conversationId && (
          <>
            <header className={styles.paneHead}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => navigate(basePath)}
                aria-label="Back to conversations"
              >
                <ChevronLeftIcon />
              </button>
              {activeConvo && (
                <>
                  <Avatar
                    name={peerName(activeConvo.peer)}
                    color={pickColor(activeConvo.peer.id)}
                    size={32}
                    imageSrc={activeConvo.peer.avatar_url || ""}
                  />
                  <span className={styles.paneName}>{peerName(activeConvo.peer)}</span>
                </>
              )}
            </header>

            <Thread messages={thread} myId={myId} loading={threadStatus === "loading" && thread.length === 0} />

            {activeConvo && (
              <Composer
                onSend={(body) =>
                  dispatch(sendMessage({ conversationId: activeConvo.id, recipientId: activeConvo.peer.id, body }))
                }
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ── Thread ──────────────────────────────────────────────────────────────────

function Thread({
  messages,
  myId,
  loading,
}: {
  messages: { id: string; sender_id: string; body: string; created_at: string }[];
  myId: string;
  loading: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to newest whenever the count changes
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (loading) return <div className={styles.thread}>Loading…</div>;
  if (messages.length === 0) return <div className={styles.thread}>No messages yet — say hello.</div>;

  return (
    <div className={styles.thread}>
      {messages.map((m) => {
        const mine = m.sender_id === myId;
        return (
          <div key={m.id} className={`${styles.row} ${mine ? styles.rowMine : ""}`}>
            <div className={styles.bubble}>
              <p className={styles.bubbleBody}>{m.body}</p>
              <span className={styles.bubbleTime}>
                {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

// ── Composer ────────────────────────────────────────────────────────────────

function Composer({ onSend }: { onSend: (body: string) => void }) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  const submit = () => {
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className={styles.composer}>
      <textarea
        className={styles.composerInput}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Write a message…"
        rows={1}
        maxLength={4000}
        aria-label="Message"
      />
      <Button size="sm" onClick={submit} disabled={!trimmed}>
        Send
      </Button>
    </div>
  );
}

// ── Empty states ────────────────────────────────────────────────────────────

function EmptyList({
  audience,
  adminId,
  myId,
  basePath,
}: {
  audience: "admin" | "client";
  adminId: string | null;
  myId: string;
  basePath: string;
}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  if (audience === "client") {
    if (!adminId)
      return <p className={styles.hint}>You'll be able to message your counsellor once you're set up with one.</p>;
    return (
      <div className={styles.emptyBox}>
        <p>No messages yet.</p>
        <Button
          size="sm"
          onClick={async () => {
            const res = await dispatch(openConversation({ adminId, clientId: myId }));
            if (typeof res.payload === "string") navigate(`${basePath}/${res.payload}`);
          }}
        >
          Message your counsellor
        </Button>
      </div>
    );
  }

  return (
    <p className={styles.hint}>
      No conversations yet. Start one with a client using the <strong>New message</strong> button above.
    </p>
  );
}

// ── Admin "new message" picker ──────────────────────────────────────────────

function NewMessagePicker({ basePath, myId }: { basePath: string; myId: string }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const clients = useAppSelector(selectClientUsers);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && clients.length === 0) dispatch(fetchAllUsers());
  }, [open, clients.length, dispatch]);

  const options = useMemo(
    () =>
      [...clients]
        .filter((c) => !c.archived_at && !c.deleted_at)
        .sort((a, b) => (a.first_name ?? "").localeCompare(b.first_name ?? "")),
    [clients],
  );

  if (!open)
    return (
      <button type="button" className={styles.newBtn} onClick={() => setOpen(true)}>
        New message
      </button>
    );

  return (
    <select
      className={styles.newSelect}
      // biome-ignore lint/a11y/noAutofocus: opened on demand by the button above
      autoFocus
      defaultValue=""
      onChange={async (e) => {
        const clientId = e.target.value;
        if (!clientId) return;
        const res = await dispatch(openConversation({ adminId: myId, clientId }));
        setOpen(false);
        if (typeof res.payload === "string") navigate(`${basePath}/${res.payload}`);
      }}
      onBlur={() => setOpen(false)}
      aria-label="Choose a client to message"
    >
      <option value="" disabled>
        Choose a client…
      </option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.display_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}
        </option>
      ))}
    </select>
  );
}
