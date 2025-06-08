import express from "express";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";

const GIGYA_ISSUER =
  "https://gigya.authz.id/oidc/op/v1.0/4_yCXuvQ52Ux52BdaQTxUVhg";
const CLIENT_ID = "FYEcmQ4aAAZ-i69s1UZSxJ8x";
const baseUrl = process.env.BASE_URL || "http://localhost:8080";
export const gigyaOAuthProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: `${GIGYA_ISSUER}/authorize`,
    tokenUrl: `${GIGYA_ISSUER}/token`,
    registrationUrl: `${GIGYA_ISSUER}/register`,
    revocationUrl: `${GIGYA_ISSUER}/revoke`, // optional, if supported by Gigya
  },
  verifyAccessToken: async (token) => {
    console.log("verifyAccessToken", token);
    const response = await fetch(`${GIGYA_ISSUER}/userinfo`, {
      method: "POST"
     
    });
  
    if (!response.ok) {
      console.error("token_verification_failed", Object.fromEntries(response.headers.entries()));
      throw new Error('token_verification_failed');
    }
  
    const userInfo = await response.json();
  
    if (typeof userInfo !== 'object' || userInfo === null || !('sub' in userInfo)) {
      throw new Error('invalid_token');
    }
  
    return {
      token,
      issuer: GIGYA_ISSUER,
      subject: String(userInfo.sub), // 'sub' is a standard claim for the subject (user's ID)
      clientId: CLIENT_ID, // Client ID is not used in this example, but can be set if needed
      scopes: ["openid", "profile", "email"],
      claims: userInfo,
    };
  },
  getClient: async (client_id) => {
    console.log("getClient", client_id);
    return {
      client_id,
      scope: "openid profile email",
      redirect_uris: [
        "http://localhost:6274/oauth/callback",
        'http://localhost:8080/oauth/callback',

        'http://localhost:8090/oauth/callback',
        `${baseUrl}/oauth/callback`,
        `${baseUrl}/oauth/callback/debug`,
        "http://localhost:8090/callback",
        "http://localhost:6274/oauth/callback/debug",
      ],
    };
  },
});

// Ensure 'scopes' is always present in the authorize request
const originalAuthorize =
  gigyaOAuthProvider.authorize?.bind(gigyaOAuthProvider);
gigyaOAuthProvider.authorize = async function (client, params, res) {
  console.log("authorize", client, params);
  if (!params.scopes || params.scopes.length === 0) {
    params.scopes = ["openid", "profile", "email"];
  }
  if (originalAuthorize) {
    return originalAuthorize(client, params, res);
  }
  // fallback: throw if no original implementation
  throw new Error("No authorize implementation found on gigyaOAuthProvider");
};

// Add logging to token endpoint methods
const originalExchangeAuthorizationCode =
  gigyaOAuthProvider.exchangeAuthorizationCode?.bind(gigyaOAuthProvider);
gigyaOAuthProvider.exchangeAuthorizationCode = async function (
  client,
  code,
  codeVerifier
) {
  console.log("exchangeAuthorizationCode", { client, code, codeVerifier });
  try {
    //   const result = await originalExchangeAuthorizationCode(client, code, codeVerifier);
    const result = await fetch(`${GIGYA_ISSUER}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code: code,
        code_verifier: codeVerifier!,
        grant_type: "authorization_code",
        redirect_uri:"http://localhost:8080/oauth/callback",
        client_id: client.client_id,
      }),
    });
    if (!result.ok) {
      console.error(
        "exchangeAuthorizationCode error",
        result,
        Object.fromEntries(result.headers.entries())
      );
      throw new Error("Failed to exchange authorization code");
    }
    const data = await result.json();
    console.log("exchangeAuthorizationCode result", data);
    return data;
  } catch (err) {
    console.error("exchangeAuthorizationCode error", err);
    throw err;
  }
};

const originalExchangeRefreshToken =
  gigyaOAuthProvider.exchangeRefreshToken?.bind(gigyaOAuthProvider);
if (originalExchangeRefreshToken) {
  gigyaOAuthProvider.exchangeRefreshToken = async function (
    client,
    refreshToken,
    scopes
  ) {
    console.log("exchangeRefreshToken", { client, refreshToken, scopes });
    try {
      const result = await originalExchangeRefreshToken(
        client,
        refreshToken,
        scopes
      );
      console.log("exchangeRefreshToken result", result);
      return result;
    } catch (err) {
      console.error("exchangeRefreshToken error", err);
      throw err;
    }
  };
}


/* debug client registration */

// Log available methods on clientsStore
const clientStore = gigyaOAuthProvider.clientsStore;
console.log("[DCR] clientsStore methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(clientStore)));

// Wrap 'registerClient' method if present
const originalRegisterClient = clientStore.registerClient?.bind(clientStore);
if (originalRegisterClient) {
  clientStore.registerClient = async function(params) {
    try {
      console.log("[DCR] registerClient called with params:", params);
      const result = await originalRegisterClient(params);
      console.log("[DCR] registerClient result:", result);
      return result;
    } catch (err) {
      console.error("[DCR] registerClient error:", err);
      throw err;
    }
  };
}


// Express middleware to log all /register requests
const app = express();
app.use(express.json());
app.use("/register", (req, res, next) => {
  console.log("[DCR] /register endpoint hit", req.method, req.body);
  next();
});

export const gigyaOAuthRouter = mcpAuthRouter({
  provider: gigyaOAuthProvider,
  baseUrl: new URL(baseUrl),
  issuerUrl: new URL(GIGYA_ISSUER),
  clientRegistrationOptions: {
    clientSecretExpirySeconds: 3600,
  },
});

export const requireAuth = requireBearerAuth({
  provider: gigyaOAuthProvider,
  requiredScopes: ["openid", "profile", "email"],
});

// Uncomment to run as standalone Express app for debugging
// const port = process.env.OAUTH_PORT || 8081;
// app.use(gigyaOAuthRouter);
// app.listen(port, () => {
//   console.log(`OIDC Auth server running at http://localhost:${port}`);
// });


