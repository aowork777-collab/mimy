/** Only available start times and supported durations are returned; no customer data. */
export async function availableShifts(db:D1Database, after:number, customer:string){
 const {results}=await db.prepare(`
  WITH RECURSIVE candidates(id,cast_id,starts,ends) AS (
   SELECT s.id,s.cast_id,MAX(s.starts,(CAST(?/1800000 AS INTEGER)+1)*1800000),s.ends
   FROM shifts s JOIN cast_profiles p ON p.id=s.cast_id JOIN members m ON m.id=s.cast_id
   WHERE s.enabled=1 AND p.status='approved' AND m.blocked=0 AND s.ends>?
   UNION ALL
   SELECT id,cast_id,starts+1800000,ends FROM candidates WHERE starts+3600000<=ends
  )
  SELECT c.id,c.cast_id,c.starts,c.ends,
   CASE WHEN c.starts+3600000<=c.ends AND NOT EXISTS (
    SELECT 1 FROM reservations r WHERE r.status IN ('held','confirmed','completed')
     AND (r.cast_id=c.cast_id OR r.customer=?)
     AND r.starts<c.starts+3600000 AND r.starts+r.minutes*60000>c.starts
   ) THEN 1 ELSE 0 END AS can_book_60
  FROM candidates c WHERE c.starts+1800000<=c.ends AND NOT EXISTS (
   SELECT 1 FROM reservations r WHERE r.status IN ('held','confirmed','completed')
    AND (r.cast_id=c.cast_id OR r.customer=?)
    AND r.starts<c.starts+1800000 AND r.starts+r.minutes*60000>c.starts
  ) ORDER BY c.starts,c.cast_id,c.id
 `).bind(after,after,customer,customer).all();
 return results;
}
