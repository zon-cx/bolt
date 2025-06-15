import {InMemoryOAuthClientProvider} from "./mcp.auth.client";
import type {OAuthClientMetadata} from "@modelcontextprotocol/sdk/shared/auth.js";
import {env} from "node:process";
import {ServerResponse} from "node:http";
import {ParamsIncomingMessage} from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import {URL, URLSearchParams} from "node:url";





export const authCallback =async (req: ParamsIncomingMessage, res: ServerResponse) => { 
        const url = new URLSearchParams(req.url!.split("?")[1]);
        const authCode = url.get("code")!;
        const state = url.get("state")!;
        console.log("authCallback", state, authCode);
        const authState = InMemoryOAuthClientProvider.finishAuth(state, authCode); 
         if(authState.has("permalink")){
            console.log("authState.get(permalink)", authState.get("permalink"));
            res.setHeader("Location", authState.get("permalink")!);
         }else{
            res.setHeader("Location", `https://slack.com/app_redirect?app=${env.SLACK_BOT_APP_ID}`);
         }
         res.statusCode = 302;
         res.end();
};


 