"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { generateOrderId } from "@/lib/headstoneOrder";

// /headstones/new — generates a fresh order ID and replaces the URL
// with /headstones/<id>. Keeps the editor's URL stable across refreshes
// so the upsert lands on the same row.

export default function NewHeadstoneOrderPage() {
  const router = useRouter();
  useEffect(() => {
    const id = generateOrderId();
    router.replace(`/headstones/${encodeURIComponent(id)}`);
  }, [router]);
  return (
    <p className="rounded-2xl bg-white p-8 text-center text-mist-400 shadow-soft">
      Starting new order…
    </p>
  );
}
