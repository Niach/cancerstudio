import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // CANCERSTUDIO_MODE=public on the Vercel cancerstudio.org marketing build.
  // Unset (or anything else) = "app", which is what Docker self-hosters and
  // local dev see, so `/` lands on the workspaces view rather than the
  // marketing hero.
  const mode = process.env.CANCERSTUDIO_MODE ?? "app";
  if (mode !== "public" && req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/workspaces";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
