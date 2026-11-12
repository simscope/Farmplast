// Start both targets even when either one rejects or throws synchronously.
export async function runEmployeeSyncTargets(zkt,sacs){
 return Promise.allSettled([Promise.resolve().then(zkt),Promise.resolve().then(sacs)]);
}
