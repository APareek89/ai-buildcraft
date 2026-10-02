import {NextResponse,type NextRequest} from "next/server";
import {actorFor} from "@/lib/server/auth";
export async function proxy(req:NextRequest){
 try{if(await actorFor(req))return NextResponse.next();}catch{/* unavailable auth never exposes a workspace */}
 const url=new URL('/login',req.url);url.searchParams.set('next',req.nextUrl.pathname);return NextResponse.redirect(url);
}
export const config={matcher:['/assistant/:path*','/configure/:path*','/dashboard/:path*','/tracker/:path*','/connector/:path*']};
