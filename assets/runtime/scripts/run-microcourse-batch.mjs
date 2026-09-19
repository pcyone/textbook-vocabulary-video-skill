import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {microcourseUnit} from './lib/microcourse-unit.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const phase=process.argv[2];if(!['voice','stills','render'].includes(phase))throw new Error('Use voice, stills or render');
const unitArg=process.argv.find(a=>a.startsWith('--unit='));
const unit=microcourseUnit({unitId:unitArg?.slice(7)});
const slugs=process.argv.slice(3).filter(a=>!a.startsWith('--unit='));if(!slugs.length)throw new Error('Explicit lessons required');
if(slugs.some(s=>!/^(?:u\d+-)?\d{2}-[a-z-]+$/.test(s)))throw new Error('Invalid lesson slug');
const failures=[];
for(const slug of slugs){
 console.log(`START ${phase} ${slug}`);
 const args=phase==='voice'?['scripts/voice-microcourse.mjs',`data/grade7/semester1/${unit}/${slug}.json`]:['scripts/render-microcourse.mjs',`--lesson=${slug}`,...(phase==='stills'?['--stills']:[])];
 let log='',line='';
 const code=await new Promise((done,reject)=>{const child=spawn(process.execPath,args,{cwd:root,stdio:['ignore','pipe','pipe']});
  const capture=data=>{const text=data.toString();log+=text;line+=text;const lines=line.split('\n');line=lines.pop();for(const l of lines)if(/^(Render |Layout PASS:|READY:)/.test(l))console.log(`${slug}: ${l}`);};
  child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',reject);child.on('close',done);
 });
 const out=resolve(root,`out/grade7/semester1/${unit}/${slug}`);mkdirSync(out,{recursive:true});writeFileSync(resolve(out,`${phase}-build.log`),log);
 if(code!==0){failures.push(slug);console.log(`FAILED ${slug}: ${log.slice(-1600)}`);}else console.log(`DONE ${slug}`);
}
if(failures.length){console.error(`Failed: ${failures.join(', ')}`);process.exitCode=1;}
