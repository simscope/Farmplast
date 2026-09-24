export function createSacsSso({secret,url,adminUrl,allowedUserIds,clientForToken,fetchImpl=fetch}) {
  const allowed = new Set((allowedUserIds || '').split(',').map(id=>id.trim()).filter(Boolean));
  return async ({method,authorization,body}) => {
    const reply=(status,error)=>({status,body:{error}});
    if (method !== 'POST') return reply(405,'method_not_allowed');
    const token=typeof authorization === 'string' ? authorization.match(/^Bearer\s+(\S+)$/i)?.[1] : null;
    if (!token) return reply(401,'unauthorized');
    if (body && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) return reply(400,'invalid_request');
    if (!secret || !url || !adminUrl || !allowed.size) return reply(503,'sso_unavailable');
    try {
      const client=clientForToken(token);
      const {data,error}=await client.auth.getUser(token);
      if (error || !data?.user) return reply(401,'unauthorized');
      // Immutable server allowlist AND database role; never trust user_metadata or UI fallback.
      if (!allowed.has(data.user.id)) return reply(403,'forbidden');
      const {data:profile,error:pError}=await client.from('profiles').select('id,role').eq('id',data.user.id).single();
      if (pError || profile?.id !== data.user.id || profile.role !== 'admin') return reply(403,'forbidden');
      const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','x-farmplast-sso-secret':secret},body:JSON.stringify({source_user_id:data.user.id}),signal:AbortSignal.timeout(15000)});
      if (!response.ok) return reply(502,'sso_unavailable');
      const result=await response.json();
      const target=new URL(result.url), expected=new URL(adminUrl);
      if (target.protocol !== 'https:' || target.origin !== expected.origin || target.pathname !== '/auth/farmplast' || target.username || target.password || target.hash || [...target.searchParams.keys()].join() !== 'code' || !/^[a-f0-9]{64}$/.test(target.searchParams.get('code') || '')) return reply(502,'sso_unavailable');
      return {status:200,body:{url:target.href}};
    } catch { return reply(502,'sso_unavailable'); }
  };
}
