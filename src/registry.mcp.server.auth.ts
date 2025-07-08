import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { env } from "node:process";
import { jwtDecode, JwtPayload } from "jwt-decode";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { connectYjs } from "./store.yjs";
import { hash } from "node:crypto";

const GIGYA_ISSUER =
  "https://gigya.authz.id/oidc/op/v1.0/4_yCXuvQ52Ux52BdaQTxUVhg";

const authState =  connectYjs("@mcp.auth").getMap<Record<string, unknown>>("tokens");

export const proxyProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: `${GIGYA_ISSUER}/authorize`,
    tokenUrl: `${GIGYA_ISSUER}/token`,
    registrationUrl: `${GIGYA_ISSUER}/register`,
    revocationUrl: `${GIGYA_ISSUER}/revoke`, // optional, if supported by Gigya
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
      extra:userInfo,
      clientId: azp || "default-client",
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

export const authRouter = mcpAuthRouter({
  provider: proxyProvider,
  issuerUrl: new URL("https://mcp-auth.val.run"),
  baseUrl: new URL("https://mcp-auth.val.run"),
  serviceDocumentationUrl: new URL("https://docs.example.com/"),
  scopesSupported: ["openid", "profile", "email"],
});

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
