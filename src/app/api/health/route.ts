import { NextResponse } from "next/server";

// GNC ERP — hafif sağlık ucu (Liveness probe)
// NOT: Bilinçli olarak DB/Prisma içe aktarılmaz. Amaç yalnızca "süreç ayakta mı"
// sorusunu ucuz yanıtlamaktır. Kurumsal sitenin /api/status'u 1.6s timeout ile
// bu ucu sorgular; ana sayfa derlemesi (AppShell ağacı ~1.4GB RAM) tetiklenmemeli.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "gnc-erp",
    port: 3001,
    db: "gnc_erp@postgresql-17",
    at: new Date().toISOString(),
  });
}
