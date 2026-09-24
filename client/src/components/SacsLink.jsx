import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function SacsLink({ className }) {
  const [opening,setOpening]=useState(false);
  const [blocked,setBlocked]=useState(false);
  const adminUrl=import.meta.env.VITE_SACS_ADMIN_URL;
  if (!adminUrl) return <span className="text-sm text-slate-400">SACS link unavailable</span>;
  const loginUrl=new URL('/login',adminUrl).href;
  async function open(event) {
    event.preventDefault();
    if (opening) return;
    // Reserve the tab within the click gesture, before awaiting network requests.
    const tab=window.open('about:blank','_blank');
    if (!tab) {setBlocked(true);return;}
    tab.opener=null;
    setOpening(true);setBlocked(false);
    try {
      const {data,error}=await supabase.auth.getSession();
      if (error || !data.session) throw Error('No session');
      const response=await fetch('/api/sacs-sso',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:'{}',cache:'no-store',signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw Error('SSO unavailable');
      const result=await response.json();
      const target=new URL(result.url);
      if (target.origin !== new URL(adminUrl).origin || target.pathname !== '/auth/farmplast') throw Error('Invalid destination');
      tab.location.replace(target.href);
    } catch { if (!tab.closed) tab.location.replace(loginUrl); }
    finally { setOpening(false); }
  }
  return <div>
    <a href={loginUrl} target="_blank" rel="noopener noreferrer" onClick={open} className={className} aria-busy={opening} aria-disabled={opening}>{opening ? 'Opening SACS...' : 'Open SACS'}</a>
    {blocked && <p className="mt-2 text-xs text-slate-400">Allow pop-ups and try again, or <a href={loginUrl} target="_blank" rel="noopener noreferrer" className="underline">sign in to SACS</a>.</p>}
  </div>;
}
