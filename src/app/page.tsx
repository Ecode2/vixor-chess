"use client";

import dynamic from "next/dynamic";

const VixorChess = dynamic(() => import("@/components/VixorChess"), { ssr: false });

export default function Page() {
  return <VixorChess />;
}
