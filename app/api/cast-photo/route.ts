import {withEmailIdentity} from '../../../lib/email-auth';
import {env} from 'cloudflare:workers';
import {handlePhoto} from '../../../lib/photo-service';
export const dynamic='force-dynamic';
export const GET=(req:Request)=>withEmailIdentity(req,env,r=>handlePhoto(r,env),req.method==='GET');
export const POST=(req:Request)=>withEmailIdentity(req,env,r=>handlePhoto(r,env),req.method==='GET');
