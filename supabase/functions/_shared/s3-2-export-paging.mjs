// US Store S3.2: stable primary-key traversal of self-authored RLS rows.
// This has NO DB/Storage access: all network operations are injected.
// Keyset pagination avoids offset skips when earlier rows are deleted.
// It is NOT a transactional snapshot: content changes during export can
// still affect results. Whole-export snapshot review remains mandatory.
export const EXPORT_PAGE_SIZE = 50;
export const EXPORT_PAGE_LIMIT = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = code => { const e=new Error(code);e.code=code;return e; };
const validUUID = value => typeof value === 'string' && UUID.test(value) && value===value.toLowerCase();
const SORT_KEYS=Object.freeze({notification_preferences:'user_id'});

export function sortKeyForExportDomain(table){
 if(typeof table!=='string'||!/^[a-z][a-z0-9_]*$/.test(table))throw fail('export_paging_bad_table');
 return SORT_KEYS[table] || 'id';
}

/**
 * @param {{
 *   spec?: {table:string, owner:string, select:string, tenant:boolean, fields:readonly string[]},
 *   fetchPage?: (request:{
 *     spec:{table:string, owner:string, select:string, tenant:boolean, fields:readonly string[]},
 *     sortKey:string, cursor:string|null, limit:number
 *   })=>Promise<unknown[]>,
 *   maxRows?:number, pageSize?:number
 * }} [options]
 */
export async function collectDomainRows({spec,fetchPage,maxRows=EXPORT_PAGE_LIMIT,pageSize=EXPORT_PAGE_SIZE}={}){
 if(!spec||typeof spec!=='object'||typeof spec.table!=='string'||typeof fetchPage!=='function'
 || !Number.isInteger(pageSize)||pageSize<1||pageSize>100
 || !Number.isInteger(maxRows)||maxRows<1||maxRows>EXPORT_PAGE_LIMIT)
   throw fail('export_paging_invalid');
 const sortKey=sortKeyForExportDomain(spec.table);
 if(!Array.isArray(spec.fields)||!spec.fields.includes(sortKey)||!spec.fields.includes(spec.owner))
   throw fail('export_paging_bad_schema');

 const result=[],seen=new Set();
 let cursor=null;
 // Extra page at the hard cap detects further records and rejects;
 // unlike LIMIT N, it must never return a success missing later rows.
 for(let pageNo=0;pageNo<=Math.ceil(maxRows/pageSize);pageNo++){
   const page=await fetchPage({spec,sortKey,cursor,limit:pageSize});
   if(!Array.isArray(page)||page.length>pageSize)throw fail('export_paging_bad_page');
   for(const row of page){
     if(!row||typeof row!=='object'||Array.isArray(row))throw fail('export_paging_bad_row');
     const id=row[sortKey];
     if(!validUUID(id)||seen.has(id)||(cursor!==null&&id<=cursor))throw fail('export_paging_inconsistent_cursor');
     seen.add(id);cursor=id;
     result.push(row);
     if(result.length>maxRows)throw fail('export_too_large');
   }
   if(page.length<pageSize)return result;
 }
 throw fail('export_too_large');
}
