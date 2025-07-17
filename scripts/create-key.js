#!/usr/bin/env node

import * as fs  from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import  jose from 'node-jose';
const keyStore = jose.JWK.createKeyStore()
keyStore.generate('RSA', 2048, {alg: 'RS256', use: 'sig' }) .then(result => {   fs.writeFileSync(     'keys.json',      JSON.stringify(keyStore.toJSON(true), null, '  ')   ) }) 