import { redirect } from "next/navigation";

// The middleware sends signed-out visitors to /login before this runs.
export default function HomePage() {
  redirect("/dashboard");
}
