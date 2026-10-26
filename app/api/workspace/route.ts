import { env } from 'cloudflare:workers';
import { handleWorkspace } from '../../../lib/workspace-service';
export const dynamic='force-dynamic';
export function GET(req:Request){return handleWorkspace(req,env);}
export function POST(req:Request){return handleWorkspace(req,env);}
