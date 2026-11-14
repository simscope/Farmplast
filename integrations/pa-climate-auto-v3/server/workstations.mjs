import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {sha256,secureEqual,token} from './storage.mjs';

// Separate, revocable workstation credentials. Never distribute the MSI admin key.
export class Workstations {
  constructor(dir) {this.file=path.join(dir,'workstations.json');this.state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{tickets:{},clients:{}};}
  persist() {const tmp=this.file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.state),{mode:0o600,flag:'wx'});fs.renameSync(tmp,this.file);}
  issue(name) {
    if(typeof name!=='string'||!/^[A-Za-z0-9 _-]{1,64}$/.test(name))throw Error('Invalid workstation name');
    const ticket=token(),id=crypto.randomUUID();
    for(const [key,value] of Object.entries(this.state.tickets))if(value.expires<Date.now())delete this.state.tickets[key];
    this.state.tickets[sha256(ticket)]={id,name,expires:Date.now()+600000};this.persist();
    return {ticket,expires_at:new Date(Date.now()+600000).toISOString()};
  }
  redeem(ticket) {
    if(typeof ticket!=='string'||ticket.length>100)return null;
    const digest=sha256(ticket),entry=this.state.tickets[digest];
    if(!entry||entry.expires<Date.now())return null;
    const credential=token(); delete this.state.tickets[digest];
    this.state.clients[entry.id]={id:entry.id,name:entry.name,hash:sha256(credential),created_at:new Date().toISOString(),revoked:false};this.persist();
    return {workstation_id:entry.id,workstation_token:credential};
  }
  authenticate(credential) {
    if(typeof credential!=='string'||credential.length<30||credential.length>100)return false;
    const digest=sha256(credential);
    return Object.values(this.state.clients).some(c=>!c.revoked&&secureEqual(c.hash,digest));
  }
  list() {return Object.values(this.state.clients).map(({hash,...safe})=>safe);}
  revoke(id) {if(!this.state.clients[id])return false;this.state.clients[id].revoked=true;this.persist();return true;}
}
