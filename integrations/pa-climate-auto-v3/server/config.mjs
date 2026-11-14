import fs from 'node:fs';
import path from 'node:path';

export const defaultConfigPath=()=>process.platform==='win32' ? 'E:\\SimScopeData\\Farmplast\\Climate\\climate.env' : path.resolve('climate.env');
export function loadConfig(configFile) {
  const file=configFile??defaultConfigPath();
  if(!fs.existsSync(file))throw Error(`Missing climate configuration: ${file}`);
  const config={};
  for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)) {
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const m=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if(!m)throw Error('Invalid config line (KEY=VALUE expected)');
    config[m[1]]=m[2].trim();
  }
  config.DATA_DIR ||= path.dirname(path.resolve(file));
  config.PORT ||= '18177';
  if(!/^[0-9]{2,5}$/.test(config.PORT)||Number(config.PORT)>65535)throw Error('Invalid PORT');
  return config;
}