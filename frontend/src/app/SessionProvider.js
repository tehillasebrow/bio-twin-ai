"use client";
import { SessionProvider as Provider } from "next-auth/react";

// The "default" keyword here is CRITICAL
export default function SessionProvider({ children, session }) {
  return <Provider session={session}>{children}</Provider>;
}