import fetch from 'node-fetch';

const MCP_REGISTRATION_URL = 'http://localhost:8080/register'; // Adjust if needed

const payload = {
  redirect_uris: ['http://localhost:8090/oauth/callback'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  client_name: 'Slack MCP Client',
  scope: 'openid profile email'
};

async function main() {
//   console.log('POST', MCP_REGISTRATION_URL);
//   console.log('Payload:', JSON.stringify(payload, null, 2));
//   try {
//     const res = await fetch(MCP_REGISTRATION_URL, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(payload)
//     });
//     const text = await res.text();
//     console.log('Status:', res.status);
//     console.log('Headers:', res.headers.raw());
//     console.log('Body:', text);
//   } catch (err) {
//     if (err.response) {
//       const errorBody = await err.response.text();
//       console.error('Gigya DCR error:', errorBody);
//     }
//     throw err;
//   }
// }



  fetch("http://localhost:8080/register", {
    "headers": {
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9,he;q=0.8",
      "content-type": "application/json",
    },
    "body": "{\"redirect_uris\":[\"http://localhost:8090/oauth/callback\"],\"token_endpoint_auth_method\":\"none\",\"grant_types\":[\"authorization_code\",\"refresh_token\"],\"response_types\":[\"code\"],\"client_name\":\"MCP Inspector\",\"client_uri\":\"https://github.com/modelcontextprotocol/inspector\"}",
    "method": "POST",
    "mode": "cors",
    "credentials": "omit"
  }).then(res => res.json()).then(console.log).catch(console.error);

}

main().catch(console.error)