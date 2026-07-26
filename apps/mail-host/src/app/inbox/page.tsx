import { env } from "@/lib/env";
import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  return <InboxClient authClientUrl={env.AUTH_CLIENT_URL} />;
}
