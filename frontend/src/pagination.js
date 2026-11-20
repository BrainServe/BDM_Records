/** Client-side table paging. Keeps every row available for grid edits and full exports. */
export const PAGE_SIZE_OPTIONS=Object.freeze([10,25,50,100]);
export function paginateRows(rows, requestedPage=1, pageSize=10) {
  if (!Array.isArray(rows)) throw new TypeError('Rows must be an array');
  if (!PAGE_SIZE_OPTIONS.includes(pageSize)) throw new RangeError('Unsupported page size');
  const pageCount=Math.max(1,Math.ceil(rows.length/pageSize));
  const numeric=Number(requestedPage);
  const page=Number.isSafeInteger(numeric)?Math.max(1,Math.min(pageCount,numeric)):1;
  const start=(page-1)*pageSize;
  const end=Math.min(start+pageSize,rows.length);
  return {rows:rows.slice(start,end),page,pageSize,pageCount,start,end,total:rows.length};
}
