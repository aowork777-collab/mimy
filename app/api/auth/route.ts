import {env} from 'cloudflare:workers';
import {handleAuth} from '../../../lib/email-auth';
export const dynamic='force-dynamic';
export const POST=(req:Request)=>handleAuth(req,env);
