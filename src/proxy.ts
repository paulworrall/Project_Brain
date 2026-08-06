import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_ROUTES = ["/login", "/signup"];

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isPublicRoute = PUBLIC_ROUTES.includes(req.nextUrl.pathname);

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isLoggedIn && isPublicRoute) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:svg|png|ico)$).*)"],
};
