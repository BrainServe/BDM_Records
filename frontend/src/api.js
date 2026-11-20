// Access tokens are held in memory only. The opaque refresh token is HttpOnly.
let accessToken = null;
let refreshing = null;
const root = '/api';
export function setToken(value) { accessToken = value; }
async function unpack(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || (response.status === 401 ? 'Session expired. Sign in again.' : `Request failed (${response.status})`));
    // Preserve the status so a temporary network/server error is never mistaken
    // for a confirmed expired refresh session.
    error.status = response.status;
    throw error;
  }
  return data;
}
async function requestRefresh() {
  // Cookie rotation must be serialized across same-origin tabs, not just requests in one tab.
  // Web Locks are supported by current desktop/mobile Chromium, Firefox and Safari.
  const once = () => fetch(`${root}/auth/refresh`, {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}});
  let response = await once();
  if (response.status === 409) {
    // A different tab just rotated. Its Set-Cookie may still be propagating.
    await new Promise(resolve=>setTimeout(resolve,180));
    response = await once();
  }
  const data = await unpack(response);
  accessToken = data.accessToken;
  return data;
}
export async function refreshSession() {
  if (!refreshing) {
    const run = () => requestRefresh();
    const locking = globalThis.navigator?.locks?.request
      ? globalThis.navigator.locks.request('brainserve-refresh-session', {mode:'exclusive'}, run)
      : run();
    refreshing = Promise.resolve(locking).finally(() => {refreshing = null;});
  }
  return refreshing;
}
export async function authorize(kind, username, password, setupKey) {
  const payload = {username,password};
  if (kind === 'setup') payload.setupKey = setupKey;
  const response = await fetch(`${root}/auth/${kind}`, {
    method:'POST', credentials:'include', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload)
  });
  const data = await unpack(response);
  accessToken = data.accessToken;
  return data;
}
export async function setupStatus() { return unpack(await fetch(`${root}/auth/status`, { credentials:'include' })); }
function notifySessionExpired() {
  accessToken = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('session-expired'));
}
/**
 * Retry protected calls after access-token expiry.
 * Downloads must not trigger a global logout because one file request failed:
 * report the problem and let the user retry or sign in explicitly.
 */
async function authorizedResponse(path, {method='GET', body, retry=true, preservePageOn401=false}={}) {
  const fetchOnce = () => fetch(`${root}${path}`, {
    method, credentials:'include',
    headers: { ...(body === undefined ? {} : {'Content-Type':'application/json'}), ...(accessToken ? { Authorization:`Bearer ${accessToken}` } : {}) },
    ...(body === undefined ? {} : {body: JSON.stringify(body)})
  });
  let response = await fetchOnce();
  if (response.status !== 401 || path.startsWith('/auth/')) return response;

  if (retry) {
    try {
      await refreshSession();
      response = await fetchOnce();
    } catch (error) {
      // A refresh 401 is a confirmed invalid session. For ordinary API requests
      // redirect to login; for a PDF request show an actionable download error.
      // A 409, 5xx or network error must never silently log the user out.
      if (error.status === 401 && !preservePageOn401) notifySessionExpired();
      if (preservePageOn401 && error.status === 401) {
        const problem = new Error('PDF download could not authenticate. Your session may have expired; sign in again and retry.');
        problem.status = 401;
        throw problem;
      }
      throw error;
    }
  }
  if (response.status === 401 && !preservePageOn401) notifySessionExpired();
  return response;
}
export async function api(path, options={}) {
  const response=await authorizedResponse(path,options);
  if (response.status === 204) return null;
  return unpack(response);
}
export async function downloadPdf(path) {
  const response=await authorizedResponse(path, {preservePageOn401:true});
  if (!response.ok) {await unpack(response);throw new Error(`Download failed (${response.status})`);}
  const type=response.headers.get('Content-Type')||'';
  if (!type.toLowerCase().includes('application/pdf')) throw new Error('The server returned an unexpected file type.');
  const blob=await response.blob();
  if (blob.size === 0) throw new Error('The PDF export was empty.');
  if (await blob.slice(0,5).text() !== '%PDF-') throw new Error('The server did not return a valid PDF file.');
  return blob;
}
export async function signOut() {
  // Preserve the current session on network/server failure so logout can be retried.
  // Never pretend an unacknowledged server-side revocation succeeded.
  const response = await fetch(`${root}/auth/logout`, {method:'POST', credentials:'include', ...(accessToken ? {headers:{Authorization:`Bearer ${accessToken}`}} : {})});
  if (!response.ok) return unpack(response);
  accessToken = null;
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('brainserve-auth');
    channel.postMessage({type:'logout'});
    channel.close();
  }
}
