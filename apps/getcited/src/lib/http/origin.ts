import {origin} from '../server/security';
/** The issuer/redirect base is configuration, never a caller's forwarded host. */
export function publicOrigin(_req?:Request){return origin();}
