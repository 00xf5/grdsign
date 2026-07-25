import { env } from "@/lib/env";
import InboxClient from "./InboxClient";

export default function InboxPage() {
  return <InboxClient authClientUrl={env.AUTH_CLIENT_URL} />;
}
