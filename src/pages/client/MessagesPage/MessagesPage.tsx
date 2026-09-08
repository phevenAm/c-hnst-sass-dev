import MessagesView from "@components/messaging/MessagesView/MessagesView";

// Client-side messaging. Route: /messages and /messages/:conversationId
export default function MessagesPage() {
  return <MessagesView basePath="/messages" audience="client" />;
}
