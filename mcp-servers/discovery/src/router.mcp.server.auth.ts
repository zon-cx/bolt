import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { env } from "node:process";
import { jwtDecode, JwtPayload } from "jwt-decode";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { connectYjs } from "./store.yjs";
import { hash } from "node:crypto";
import express from "express";

const GIGYA_ISSUER =
  "https://gigya.authz.id/oidc/op/v1.0/4_yCXuvQ52Ux52BdaQTxUVhg";

const authState =  connectYjs("@mcp.auth").getMap<Record<string, unknown>>("tokens");

export const proxyProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: `${GIGYA_ISSUER}/authorize`,
    tokenUrl: `${GIGYA_ISSUER}/token`,
    registrationUrl: `${GIGYA_ISSUER}/register`,
    revocationUrl: `${GIGYA_ISSUER}/revoke`,
   },

  verifyAccessToken: async (token) => {
    const { azp, exp, iss } = jwtDecode(token ) as JwtPayload & {azp?:string}
    console.log("verifyAccessToken", azp);
    async function attemptVerify():Promise<Record<string, unknown>> { 
        const response = await fetch(`${GIGYA_ISSUER}/userinfo`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }).catch((e)=> console.error("unexpected error during userinfo endpoint", e.message, e.stack, e.code))
        
        if (!response?.ok) {
          console.error(
            "token_verification_failed",
            response?.statusText,
            response && Object.fromEntries(response?.headers?.entries()),
            response && await response.text()
          );
          throw new UnauthorizedError(response?.statusText ?? "failed to fetch");
        }

        const userInfo = await response.json();
        if (
            typeof userInfo !== "object" ||
            userInfo === null ||
            !("sub" in userInfo)
          ) {
            throw new UnauthorizedError("invalid_token");
          }
          
        return {
          ...userInfo,
          name:
            userInfo.nickname ||
            userInfo.name ||
            userInfo.given_name ||
            userInfo.family_name,

          expiresAt: new Date(exp! * 1000).toISOString(),
        } 
    }
    const id= hash( "sha1", token.split(".")[2]).toString();
    console.debug("token id", id)
    if (!authState.has(id)) {
        authState.set(id, await attemptVerify());
    }
    const userInfo = authState.get(id)!;

    return {
      issuer: iss,
      scopes: ["openid", "profile", "email"],
      token, 
        //When the token expires (in seconds since epoch).
        //exp=>   expires_in
        //          RECOMMENDED.  The lifetime in seconds of the access token.  For
        //          example, the value "3600" denotes that the access token will
        //          expire in one hour from the time the response was generated.
        //          If omitted, the authorization server SHOULD provide the
        //          expiration time via other means or document the default value.
      expiresAt: Date.now() + (exp || 1) * 1000,
      extra:userInfo,
      clientId: azp || "default-client",
      resource: new URL(`${env.BASE_URL || "http://localhost:8080"}/oauth/protected-resource/mcp`),
    };
  },
  getClient: async (client_id) => {
    return {
      scope: "openid profile email",
      client_id,
      redirect_uris: [
        "http://localhost:3000/callback",
        "http://localhost:6274/oauth/callback/debug",
        "http://localhost:6274/oauth/callback",
        "http://localhost:8080/oauth/callback",
        "http://localhost:8090/oauth/callback",
        `${env.BASE_URL || "http://localhost:8080"}/oauth/callback`,
        `${env.BASE_URL || "http://localhost:8080"}/oauth/callback/debug`,
      ],
    };
  },
});

// proxyProvider.authorize = async (client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) => {
//   console.log("authorize", client, params, res)
//   params.scopes= params.scopes || ["openid", "profile", "email"]
//   await proxyProvider.authorize(client, params, res)
// }
export const authRouter = mcpAuthRouter({
  provider: proxyProvider,
  issuerUrl: new URL(env.BASE_URL || "http://localhost:8090"),
  baseUrl: new URL(env.BASE_URL || "http://localhost:8090"),
   
  // baseUrl: new URL("https://mcp-auth.val.run"),
  serviceDocumentationUrl: new URL("https://docs.example.com/"),
  scopesSupported: ["openid", "profile", "email"],
});
export const protectedResourcesRouter = express.Router();

protectedResourcesRouter.use(express.json());
protectedResourcesRouter.use(express.urlencoded({ extended: true }));
//
// protectedResourcesRouter.post("token", (req, res) => {
//     console.log("token request", req.headers);
//     res.status(501).send("Not Implemented");
//     console.log("token response", res.statusCode, res.statusMessage);
// });
protectedResourcesRouter.get(
  "/.well-known/oauth-protected-resource/mcp",
  (req, res) => {
   console.log("mcp resource metadata request", req.headers);
    res.json({
        "resource": env.BASE_URL,
        "authorization_servers": [
            "https://mcp-auth.val.run"
        ],
        "scopes_supported": [
            "openid",
            "profile",
            "email"
        ],
        "resource_documentation": "https://docs.example.com/"
    });
    console.log("mcp resource metadata response", res.statusCode, res.statusMessage);
  }
);
 




export const requireAuth = requireBearerAuth({
  verifier: proxyProvider,
   requiredScopes: ["openid", "profile", "email"],
});

export function getAgentAuthInfo(
  auth: AuthInfo,
  id?: string
): { id: string; name: string } & Partial<AuthInfo> {
  id = id || (auth?.extra?.sub as string) ;
  const name = (auth?.extra?.name as string) || id;

  return {
    id,
    name,
    ...auth,
  };
}
