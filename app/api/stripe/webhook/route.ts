import {env} from 'cloudflare:workers';
import {handleStripeWebhook} from '../../../../lib/stripe-payment';

export const dynamic='force-dynamic';
export const POST=(req:Request)=>handleStripeWebhook(req,env);
