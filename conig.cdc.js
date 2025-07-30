const { URLSearchParams } = require("url");




fetch("https://fidm.eu1.gigya.com/fidm.oidc.op.setConfig", {
  method: "POST",
  headers: {
    "content-type": "multipart/form-data;",
  },
  body: new URLSearchParams({
    ["userkey"]: process.env.CDC_USER_KEY,
    ["secret"]: process.env.CDC_USER_SECRET,
    ["issuer"]: "https://gigya.authz.id/oidc/op/v1.0/4_yCXuvQ52Ux52BdaQTxUVhg",
    ["proxyPage"]: "https://gigya.authz.id/pages/login",
    ["dynamicClientRegistration"]:
      JSON.stringify({
        enabled: true,
        refreshTokenRotation: false,
        enforcePkce: true,
        skipConsent: true,
        accessTokenFormat: "jwt",
        idTokenContent: "limited",
        redirectUris: [
          "https://inspector.cfapps.eu12.hana.ondemand.com/oauth/callback/debug",
          "https://inspector.cfapps.eu12.hana.ondemand.com/oauth/callback",
          "http://localhost:3000/oauth/callback",
          "http://localhost:8080/oauth/callback",
          "https://agents.cfapps.us10-001.hana.ondemand.com/oauth/callback",
          "https://yjs.cfapps.us10-001.hana.ondemand.com/oauth/callback",
          "https://hp.cfapps.us10-001.hana.ondemand.com/oauth/callback",
          "https://assistant.cfapps.eu12.hana.ondemand.com/oauth/callback",
          "https://gateway.cfapps.eu12.hana.ondemand.com/oauth/callback",
          "https://dashboard.cfapps.eu12.hana.ondemand.com/oauth/callback",
          "https://slack.cfapps.eu12.hana.ondemand.com/oauth/callback",
          "http://localhost:8090/oauth/callback",
          "http://localhost:8080/callback",
          "http://localhost:8080/oauth/callback",
          "http://localhost:6274/oauth/callback/debug",
          "http://localhost:6274/oauth/callback",
          "https://localhost:3000/auth/callback/gigya",
          "https://mcp.authz.id/auth/callback/gigya",
          "https://mcp-inspector.cfapps.eu12.hana.ondemand.com/login/callback",
          "https://mcp-inspector-server.cfapps.eu12.hana.ondemand.com/oauth/callback",
        ],
      }),
    ["customScopes"]: "{}",
    ["customClaims"]: "{}",
    ["standardClaims"]:
      '{"uid":{"useInIdToken":true,"useInAccessToken":false},"birthdate":{"useInIdToken":true,"useInAccessToken":false},"address":{"useInIdToken":true,"useInAccessToken":false},"gender":{"useInIdToken":true,"useInAccessToken":false},"name":{"useInIdToken":true,"useInAccessToken":false},"nickname":{"useInIdToken":true,"useInAccessToken":false},"phone_number":{"useInIdToken":true,"useInAccessToken":false},"given_name":{"useInIdToken":true,"useInAccessToken":false},"family_name":{"useInIdToken":true,"useInAccessToken":false},"picture":{"useInIdToken":true,"useInAccessToken":false},"email":{"useInIdToken":true,"useInAccessToken":false}}',
    ["availableAccessTokenAudiences"]: "[]",
    ["allowIntrospectAllStaticRp"]: "true",
    ["deviceFlowConfig"]:
      '{"expiresIn":1800,"interval":5,"verificationUri":"https://gigya.authz.id/pages/device"}',
    ["cnameAsBaseDomain"]: "false",
    ["apiKey"]: "4_yCXuvQ52Ux52BdaQTxUVhg",
    ["format"]: "json",
  }),
});

 