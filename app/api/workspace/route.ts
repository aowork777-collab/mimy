import {withEmailIdentity} from '../../../lib/email-auth';
import { env } from 'cloudflare:workers';
import { handleWorkspace } from '../../../lib/workspace-service';
export const dynamic='force-dynamic';
export function GET(req:Request){return withEmailIdentity(req,env,r=>handleWorkspace(r,env));}
export function POST(req:Request){return withEmailIdentity(req,env,r=>handleWorkspace(r,env));}
