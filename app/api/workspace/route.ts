import {withEmailIdentity} from '../../../lib/email-auth';
import { env } from 'cloudflare:workers';
import { handleWorkspace } from '../../../lib/workspace-service';
export const dynamic='force-dynamic';
export function GET(req:Request){return withEmailIdentity(req,env,identity=>handleWorkspace(req,env,identity));}
export function POST(req:Request){return withEmailIdentity(req,env,identity=>handleWorkspace(req,env,identity));}
