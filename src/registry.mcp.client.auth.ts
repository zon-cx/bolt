import { OAuthClientMetadata, OAuthTokens, OAuthTokensSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { z } from "zod";
import { connectYjs } from "./store.yjs";
import { InMemoryOAuthClientProvider } from "./mcp.client.auth";
import { ServerConfig } from "./registry.mcp.client";
import { env } from "node:process";
import * as Y from "yjs";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";



export const CredentialsSchema = collectExtraKeys(z.object({
  client_id: z.string().describe("The client id to use for the server"),
  client_secret: z.string().describe("The client secret to use for the server"),
}).catchall(z.unknown()), "additionalProperties").optional();

export const AuthSettingsSchema = z.object({
  type: z.enum(["none", "passthrough", "bearer", "basic", "oauth2"]).default("oauth2").optional(),
  scopes: z.array(z.string()).optional(),
  inheritance: z.enum(["agent", "session"]).default("session").optional(),
});

export const TokenSchema = collectExtraKeys(z.object({
  ...OAuthTokensSchema.shape,
}).catchall(z.unknown()), "additionalProperties");


export const AuthSchema = collectExtraKeys(z.object({
  ...AuthSettingsSchema.shape,
  tokens: TokenSchema.optional(),
}).catchall(z.unknown()), "additionalProperties")



export type AuthConfig = z.output<typeof AuthSchema>;
// export type ServerConfig = z.output<typeof ServerSchema>;
const CALLBACK_PORT = env.PORT || 8090; // Use different port than auth server (3001)

const CALLBACK_URL = `${
  env.BASE_URL || `http://localhost:${CALLBACK_PORT}`
}/oauth/callback`;

const authState =  connectYjs("@mcp.auth");
 
const registryState = connectYjs("@mcp.registry");

export class RemoteOAuthClientProvider extends InMemoryOAuthClientProvider {

 constructor(
  public agent: string,
  public server: string, 
  public sessionId: string,
  public id: string = getCode(6),
  redirectUrl?: string,
  clientMetadata?: OAuthClientMetadata,
  public configStore: Y.Map<ServerConfig> = registryState.getMap<ServerConfig>(agent),
  public sessionStore: Y.Map<any> = authState.getMap<any>(sessionId), 
  ){  
    redirectUrl = redirectUrl || CALLBACK_URL
    super(redirectUrl, clientMetadata || {
      redirect_uris: [redirectUrl],
      response_types: ["code"],
      grant_types: ["authorization_code"],
      scope: configStore.get(server)?.auth?.scopes?.join(" "),
    }, id);

    this.store.set("agent", agent);
    this.store.set("server", server);
    this.store.set("sessionId", sessionId);
    this.serverUrl && this.sessionStore.set("url", this.serverUrl);
    this.serverConfig?.type && this.sessionStore.set("transport", this.serverConfig.type);
    this.setAuthFromServerConfig();
 }

  setAuthFromServerConfig() {
    function setTokens(this: RemoteOAuthClientProvider) {
      const config = this.serverConfig
      if(config?.auth?.type === "passthrough" && this.sessionStore.get("auth")?.token) {
        const auth = this.sessionStore.get("auth") as AuthInfo;
        this.store.set("tokens", {
          access_token: auth.token,
          expires_in: auth.expiresAt,
          scope: auth.scopes?.join(" "),
          token_type: "bearer",
          extra: auth.extra,
        } as OAuthTokens);
      } 
    }
    function setTokensFromSession(this: RemoteOAuthClientProvider) {
      const tokens = this.sessionStore.get("tokens") as OAuthTokens;
      if(tokens) {
        this.store.set("tokens", tokens as OAuthTokens);
      }
    }

    function setTokensFromServerConfig(this: RemoteOAuthClientProvider) {
      const config = this.serverConfig
      if(config?.auth?.tokens){
        this.store.set("tokens", config.auth.tokens);
      }
    }
    setTokens.bind(this)(); 
    setTokensFromServerConfig.bind(this)();
    setTokensFromSession.bind(this)();
    this.configStore.observe(setTokensFromServerConfig.bind(this));
    this.sessionStore.observe(setTokensFromSession.bind(this));
    this.sessionStore.observe(setTokens.bind(this));
    this.configStore.observe(setTokens.bind(this));
  }

  setAuth(auth: AuthInfo) {
    this.sessionStore.set("auth", auth);

  }

  get serverConfig(): ServerConfig {
    return this.configStore.get(this.server)! 
  }

  get serverUrl(): string {
    return this.serverConfig?.url || "";
  }

  get sessionInfo(): {
    url: string;
    transport: string;
    agent: string;
    server: string;
  } {
    return {
      url: this.sessionStore.get("url") as string || "",
      transport: this.sessionStore.get("transport") as string || "streamable",
      agent: this.store.get("agent") as string || "",
      server: this.store.get("server") as string || "",
    }
  }
  
  static fromState(
    id: string,
  ): RemoteOAuthClientProvider {
    const inMemoryOAuthClientProvider = InMemoryOAuthClientProvider.fromState(id);
    return new RemoteOAuthClientProvider(
      inMemoryOAuthClientProvider.store.get("agent")!,
      inMemoryOAuthClientProvider.store.get("server")!,
      inMemoryOAuthClientProvider.store.get("sessionId")!,
      inMemoryOAuthClientProvider.id,
      inMemoryOAuthClientProvider.store.get("redirectUrl") as string,
      inMemoryOAuthClientProvider.store.get("clientMetadata") as OAuthClientMetadata
    );
  }


  saveTokens(tokens: OAuthTokens): void {
    super.saveTokens(tokens);
    const config = this.serverConfig
    if(config?.auth?.type !== "passthrough"){
    switch (config?.auth?.inheritance) {  
      case "session":
        this.sessionStore.set(this.server, tokens);
        break;
      case "agent":
        this.configStore.set(this.server, {...config, auth: {...config.auth, type: "bearer", tokens }});
        break;
     default: 
      this.configStore.set(this.server, {...config, auth: {...config.auth, type: "bearer", tokens }});
      break;
    }
    }
  }
  
  // tokensAsync(): Promise<OAuthTokens> {
  //   const tokens = this.tokens.bind(this)
  //   const sessionStore = this.sessionStore;
  //   const configStore = this.configStore;
  //   return new Promise((resolve) => {
  //     function checkTokens(e?:Y.YMapEvent<any>){
  //       console.log("tokens changed", Array.from(e?.keysChanged || []))
  //       if(tokens()){
  //         sessionStore.unobserve(checkTokens);
  //         configStore.unobserve(checkTokens);
  //         resolve(tokens()!);
  //       }
  //     }
  //     checkTokens();
  //     sessionStore.observe(checkTokens);
  //     configStore.observe(checkTokens);
  //   });
  // }
 
}

function getCode(length = 4) {
  let max = Number("1".padEnd(length + 1, "0"));
  return `${Math.floor(Math.random() * max)}`.padStart(length, "0");
}




export function collectExtraKeys<
Shape extends z.ZodRawShape,
Catchall extends z.ZodTypeAny,
const K extends string
>(
obj: z.ZodObject<Shape, "strip", Catchall>,
extrasKey: K
): z.ZodEffects<
typeof obj,
z.output<z.ZodObject<Shape, "strict">> & {
  [k in K]?: Record<string, z.output<Catchall>>;
}
> {
return obj.transform((val) => {
  const extras: Record<string, z.output<Catchall>> = {};
  const { shape } = obj;
  for (const [key] of Object.entries(val)) {
    if (key in shape) {
      continue;
    }

    const v = val[key];
    if (typeof v === "undefined") {
      continue;
    }

    extras[key] = v;
    delete val[key];
  }

  return { ...val, [extrasKey]: extras};
});
}