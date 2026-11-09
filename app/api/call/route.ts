import {withEmailIdentity} from '../../../lib/email-auth';
import {env} from 'cloudflare:workers';
import {handleCall} from '../../../lib/call-service';
export const dynamic='force-dynamic';
export function POST(req:Request){return withEmailIdentity(req,env,r=>handleCall(r,env));}
