import {env} from 'cloudflare:workers';
import {withEmailIdentity} from '../../../lib/email-auth';
import {handleDiaryPhoto} from '../../../lib/diary-photo-service';
export const dynamic='force-dynamic';
export const GET=(req:Request)=>withEmailIdentity(req,env,identity=>handleDiaryPhoto(req,env,identity));
export const POST=(req:Request)=>withEmailIdentity(req,env,identity=>handleDiaryPhoto(req,env,identity));
