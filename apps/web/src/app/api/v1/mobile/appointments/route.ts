import type { NextRequest } from "next/server";
import { handleMobileAppointments, handleMobileCreateAppointment } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function GET(request: NextRequest) { return handleMobileAppointments(request); }
export function POST(request: NextRequest) { return handleMobileCreateAppointment(request); }
