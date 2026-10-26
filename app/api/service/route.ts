// Legacy sandbox records are preserved in D1 but cannot be mutated through the old API.
export function GET(){return Response.json({error:'新しい予約画面をご利用ください。旧検証データは保管されています。'},{status:410});}
export const POST=GET;
