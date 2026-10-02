import { NextResponse, type NextRequest } from "next/server";
import {requireActor} from "@/lib/server/auth";
import {executionFor,runWithExecution} from "@/lib/server/execution";
import {route,HttpError} from "@/lib/server/http";
import {userLimit} from "@/lib/server/security";
import {drizzleDatabase,schema} from "@/lib/db/client";
import {and,eq,sql} from "drizzle-orm";
import { getPlanById } from "@/lib/db/plans";
import {getConfigById} from "@/lib/db/configs";
import { buildPlanHtml, buildPlanWorkbook } from "@/lib/report/plan-report";

export const maxDuration = 60;

/**
 * Download a plan report. ?format=html|xlsx|pdf|docx (default html). Application ownership checks scope the plan to
 * the signed-in user. Records a `reports` row (best-effort) for the dashboard.
 */
export const GET=route(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const user = await requireActor(req);await userLimit(user,"export",30,3600);
  return runWithExecution(executionFor(user),async()=>{
  const { planId } = await params;
  const format = (req.nextUrl.searchParams.get("format") ?? "html").toLowerCase();

  if(!["html","xlsx","pdf","docx"].includes(format))throw new HttpError(400,"Unsupported report format.");
  const plan = await getPlanById(planId);
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  let cfg=plan.configId?await getConfigById(plan.configId):null;
  if(plan.prepared){cfg=cfg?{...cfg,brandName:"Prepared example — "+(cfg.brandName||cfg.brandUrl)}:null;if(plan.projection)plan.projection={...plan.projection,assumptions:["Prepared benchmark responses and illustrative projections. No provider call or measured live market result.",...plan.projection.assumptions]};}

  const db=await drizzleDatabase();
  await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${plan.id},91096))`);if(!(await tx.select({id:schema.reports.id}).from(schema.reports).where(and(eq(schema.reports.userId,user.id),eq(schema.reports.planId,plan.id),eq(schema.reports.format,format))).limit(1)).length)await tx.insert(schema.reports).values({userId:user.id,planId:plan.id,kind:'plan',format,title:plan.prepared?'Prepared plan report':`Plan report (${format})`});});

  const filenameBase = `getcited-plan-${plan.id.slice(0, 8)}`;

  if (format === "xlsx") {
    const buf = await buildPlanWorkbook(plan, cfg);
    if(buf.byteLength>8*1024*1024)throw new HttpError(413,"Export is too large.");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filenameBase}.xlsx"`,
      },
    });
  }

  if (format === "docx") {
    const { buildPlanDocx } = await import("@/lib/report/plan-docx");
    const buf = await buildPlanDocx(plan, cfg);
    if(buf.byteLength>8*1024*1024)throw new HttpError(413,"Export is too large.");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "cache-control": "private, no-store",
        "content-type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${filenameBase}.docx"`,
      },
    });
  }

  if (format === "pdf") {
    const { buildPlanPdf } = await import("@/lib/report/plan-pdf");
    const buf = await buildPlanPdf(plan, cfg);
    if(buf.byteLength>8*1024*1024)throw new HttpError(413,"Export is too large.");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filenameBase}.pdf"`,
      },
    });
  }

  const html = buildPlanHtml(plan, cfg);
  return new NextResponse(html, {
    headers: {
        "cache-control": "private, no-store",
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="${filenameBase}.html"`,
    },
  });
  });
});
