import {env} from 'cloudflare:workers';
import {handlePhoto} from '../../../lib/photo-service';
export const dynamic='force-dynamic';
export const GET=(req:Request)=>handlePhoto(req,env);
export const POST=(req:Request)=>handlePhoto(req,env);
