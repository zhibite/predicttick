import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/polymarket?period=5m&asset=btc");
}
