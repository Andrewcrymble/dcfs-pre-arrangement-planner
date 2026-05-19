import { NextResponse } from "next/server";
import {
  callHeadstoneAction,
  fetchHeadstoneIndex,
} from "@/lib/headstoneAppsScript";

// /api/headstones/orders
//   GET    — list all orders (proxies the headstone Apps Script's doGet)
//   POST   — upsert an order
//   DELETE ?id=<orderId> — remove an order

export async function GET() {
  const { data, error, status } = await fetchHeadstoneIndex();
  if (error) return NextResponse.json({ error }, { status });
  const obj = (data as { orders?: unknown[] }) || {};
  return NextResponse.json({ orders: obj.orders ?? [] });
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const order = body.order;
  if (!order || typeof order !== "object") {
    return NextResponse.json({ error: "order required" }, { status: 400 });
  }
  const { data, error, status } = await callHeadstoneAction("upsert", { order });
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { ok: true });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error, status } = await callHeadstoneAction("delete", {
    orderId: id,
  });
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { ok: true });
}
