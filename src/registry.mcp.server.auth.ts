import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { env } from "node:process";
import {jwtDecode} from "jwt-decode";

const GIGYA_ISSUER =
    "https://gigya.authz.id/oidc/op/v1.0/4_yCXuvQ52Ux52BdaQTxUVhg";

export const proxyProvider = new ProxyOAuthServerProvider({
    endpoints: {
        authorizationUrl: `${GIGYA_ISSUER}/authorize`,
        tokenUrl: `${GIGYA_ISSUER}/token`,
        registrationUrl: `${GIGYA_ISSUER}/register`,
        revocationUrl: `${GIGYA_ISSUER}/revoke`, // optional, if supported by Gigya
    },

    verifyAccessToken: async (token) => {
        console.log("verifyAccessToken", token);
        const response = await fetch(`${GIGYA_ISSUER}/userinfo`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },

        });

        if (!response.ok) {
            console.error("token_verification_failed", Object.fromEntries(response.headers.entries()));
            throw new Error('token_verification_failed');
        }

        const userInfo = await response.json();

        if (typeof userInfo !== 'object' || userInfo === null || !('sub' in userInfo)) {
            throw new Error('invalid_token');
        }
        const {client_id, azp} = jwtDecode(token) as {client_id?: string, azp?: string};
        return {
            issuer: GIGYA_ISSUER,
            subject: String(userInfo.sub), // 'sub' is a standard claim for the subject (user's ID)
            scopes: ["openid", "profile", "email" ],
            token,
            extra:{
                ...userInfo,
                name: userInfo.nickname || userInfo.name || userInfo.given_name || userInfo.family_name,
            },
           clientId: client_id || azp || "default-client",
        };
    },
    getClient: async (client_id) => {
        return {
            scope: "openid profile email",
            client_id,
            redirect_uris: ["http://localhost:3000/callback", "http://localhost:6274/oauth/callback/debug", "http://localhost:6274/oauth/callback", "http://localhost:8080/oauth/callback", "http://localhost:8090/oauth/callback", `${env.BASE_URL || "http://localhost:8080"}/oauth/callback`, `${env.BASE_URL || "http://localhost:8080"}/oauth/callback/debug`],
        }
    }
})

export const authRouter= mcpAuthRouter({
    provider: proxyProvider,
    issuerUrl: new URL("https://mcp-auth.val.run"),
    baseUrl: new URL( "https://mcp-auth.val.run"),
    serviceDocumentationUrl: new URL("https://docs.example.com/"),
})

export const requireAuth = requireBearerAuth({
    verifier: proxyProvider,
    requiredScopes: ["openid", "profile", "email" ],
});

export function getAuthId(extra: RequestHandlerExtra<any,any>): string {
    const id = extra?.authInfo?.extra?.sub as string  || "default";
    console.log("agent id", id, extra?.authInfo?.extra);
    return id;
  }