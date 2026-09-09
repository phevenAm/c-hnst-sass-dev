import MessagesView from "@components/messaging/MessagesView/MessagesView";

// Counsellor-side messaging. Route: /admin/messages and /admin/messages/:conversationId
export default function AdminMessagesPage() {
  return <MessagesView basePath="/admin/messages" audience="admin" />;
}
