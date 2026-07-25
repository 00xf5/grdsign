import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";

export default async function HomePage() {
  const session = await readSession();
  redirect(session ? "/inbox" : "/login");
}
