import {cpSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const target=process.argv[2];
if(!target||process.argv.length!==3)throw new Error('Usage: node init-project.mjs NEW_DIRECTORY');
const output=resolve(target);
if(existsSync(output))throw new Error('Target exists; refusing to overwrite an existing project');
const skill=resolve(dirname(fileURLToPath(import.meta.url)),'..');
cpSync(resolve(skill,'assets/runtime'),output,{recursive:true,errorOnExist:true,force:false});
for(const folder of ['data/grade7/semester1','public/microcourse/assets','out'])mkdirSync(resolve(output,folder),{recursive:true});
writeFileSync(resolve(output,'.gitignore'),'.env\n.env.*\nnode_modules/\npublic/microcourse/audio/\npublic/microcourse/*.json\npublic/microcourse/assets/\nbuild/\nout/\n.DS_Store\n');
console.log(JSON.stringify({status:'INITIALIZED',project:output,dependenciesInstalled:false,mediaIncluded:false,ttsConfigured:false}));
