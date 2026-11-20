/** Safe, side-effect-free helpers shared by forms and export logic. */
export const EMPTY_SECTION=Object.freeze({name:'',recordLabel:'Institute',itemLabel:'Course',amountUnit:'₹'});
export function sectionInput(section={}) {
  // API rejects unknown JSON properties; never forward id/counts from a fetched section.
  return Object.fromEntries(Object.keys(EMPTY_SECTION).map(key=>[key,section?.[key]??EMPTY_SECTION[key]]));
}
export function validAmount(value) {
  const v=String(value).trim();
  return v==='' || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v)<=99999999999999.99);
}
export function csvCell(value) {
  // CSV values beginning with spreadsheet operators must remain text in Excel/Sheets.
  let cell=String(value??'');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(cell))cell="'"+cell;
  return `"${cell.replaceAll('"','""')}"`;
}
/** Split large edit submissions into server-safe, individually atomic batches. */
export function chunkUpdates(items, size=500) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 1000) throw new RangeError('Invalid batch size');
  const output=[];
  for (let i=0;i<items.length;i+=size) output.push(items.slice(i,i+size));
  return output;
}
/** Only stable ASCII characters are allowed in generated local download names. */
export function downloadName(name, extension='pdf') {
  const slug=String(name||'directory').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'directory';
  return `${slug}-directory.${extension}`;
}

/** Preserve exact DECIMAL(16,2) values; never round through IEEE-754 Number. */
export function parsedAmount(value) {
  const raw=String(value??'').trim();
  return raw===''?null:raw;
}
export function displayAmount(value) {
  const [integer,decimal]=String(value).split('.');
  const withGroups=integer.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return withGroups+(decimal!==undefined?'.'+decimal:'');
}
