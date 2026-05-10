// Root — bounce to dashboard if logged in, else login.

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function Root() {
  const router = useRouter();
  useEffect(() => {
    api
      .me()
      .then(() => router.replace("/dashboard"))
      .catch(() => router.replace("/login"));
  }, [router]);
  return (
    <div className="h-screen flex items-center justify-center text-white/40 text-sm animate-pulse-soft">
      Loading Nelson...
    </div>
  );
}
