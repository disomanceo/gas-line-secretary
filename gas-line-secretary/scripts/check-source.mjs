import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const source = readFileSync(join(process.cwd(), 'src', 'Code.gs'), 'utf8');
new vm.Script(source, { filename: 'src/Code.gs' });
console.log('Apps Script source syntax looks good.');
