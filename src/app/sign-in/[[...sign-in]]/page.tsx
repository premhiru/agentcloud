import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="container grid min-h-screen place-items-center py-10">
      <div className="grid justify-items-center gap-6">
        <Link href="/" className="text-xl font-black tracking-tight">AgentCloud</Link>
        <SignIn />
      </div>
    </main>
  );
}
