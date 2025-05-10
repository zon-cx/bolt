import pkg from "@slack/bolt";
import { fromPromise } from "xstate";
import { ConversationsRepliesResponse } from "@slack/web-api";
import { AnyEventObject } from "xstate";

 
export const actions = ({
  say,
  setStatus,
  setTitle,
  setSuggestedPrompts,
  saveThreadContext,
}: AssistantThreadStartedMiddlewareArgs | AssistantUserMessageMiddlewareArgs) =>
  ({
    say: (_, params) => say(params),
    setStatus: (_, params) => setStatus(params),
    setSuggestedPrompts: (_, params) => {
      console.log("setting prompts", params);
      setSuggestedPrompts(params)
        .then((res) => {
          console.log("setting prompts res", res);
        })
        .catch((err) => {
          console.log("setting prompts err", err);
        });
    },
    setTitle: (_, params: string) => setTitle(params),
    saveContext: saveThreadContext,
  } satisfies Partial<(typeof slack)["actions"]>);

export const actors = ({
  say,
  saveThreadContext,
  setStatus,
  setTitle,
  setSuggestedPrompts,
  getThreadContext
}: AssistantThreadStartedMiddlewareArgs | AssistantUserMessageMiddlewareArgs) =>
  ({
    say: fromPromise(async ({ input }) => await say(input)),
    saveContext: fromPromise(saveThreadContext),
    getContext: fromPromise(getThreadContext),
    setStatus: fromPromise(
      async ({ input }: { input: string }) => await setStatus(input)
    ),
    setSuggestedPrompts: fromPromise(
      async ({ input }) => await setSuggestedPrompts(input)
    ),
    setTitle: fromPromise(
      async ({ input }: { input: string }) => await setTitle(input)
    ),
    // fetchThreadHistory: fromPromise(async ({ input }) => await client.conversations.replies({
    //   channel: context.botId,
    //   ts: input.message.ts,
    //   oldest: input.message.ts,
    // }).then((res)=>res.messages))
  } satisfies Partial<(typeof slack)["actors"]>);



  // --- Types ---
  type AssistantThreadStartedMiddlewareArgs =
  Parameters<pkg.AssistantThreadStartedMiddleware>[0];
type AssistantUserMessageMiddlewareArgs =
  Parameters<pkg.AssistantUserMessageMiddleware>[0];

  export type MessageEvent<T extends pkg.types.MessageEvent["subtype"]= pkg.types.MessageEvent["subtype"]> = ThreadMessageArgs & {
    type: `@message.${T}`;
    message: pkg.types.MessageEvent & { subtype: T };
  };

  export type MessageHistory = Omit<pkg.types.MessageEvent, "subtype" | "channel_type" | "channel" |"event_ts" |"type" | "ts"> & {ts?:string}



type ThreadStartedArgs = Parameters<import("@slack/bolt").AssistantThreadStartedMiddleware>[0];
type ThreadActor<T extends (args?: any) => any | void> = T extends (
  args: infer P
) => PromiseLike<infer R>
  ? import("xstate").PromiseActorLogic<R, P, AnyEventObject>
  : T extends () => PromiseLike<infer R>
  ? import("xstate").PromiseActorLogic<R, any, AnyEventObject>
  : T extends (...args: infer P) => PromiseLike<void>
  ? import("xstate").PromiseActorLogic<any, P, AnyEventObject>
  : never;

export interface AssistantPrompt {
  /** @description Title of the prompt. */
  title: string;
  /** @description Message of the prompt. */
  message: string;
}




export const slack = {
  actors: {
    say: undefined as unknown as ThreadActor<ThreadStartedArgs["say"]>,
    saveContext: undefined as unknown as ThreadActor<
      ThreadStartedArgs["saveThreadContext"]
    >,
    getContext: undefined as unknown as ThreadActor<
      ThreadStartedArgs["getThreadContext"]
    >,
    setStatus: undefined as unknown as ThreadActor<
      ThreadStartedArgs["setStatus"]
    >,
    setSuggestedPrompts: undefined as unknown as ThreadActor<
      ThreadStartedArgs["setSuggestedPrompts"]
    >,
    setTitle: undefined as unknown as ThreadActor<
      ThreadStartedArgs["setTitle"]
    >,
    fetchThreadHistory: undefined as unknown as import("xstate").PromiseActorLogic<
      ConversationsRepliesResponse["messages"],
      any,
      AnyEventObject
    >,
  },
  actions: {
    say: (_, params: Parameters<ThreadStartedArgs["say"]>[0]) => {
      console.log("saying", params);
    },
    setStatus: (_, params: Parameters<ThreadStartedArgs["setStatus"]>[0]) => {
      console.log("setting status", params);
    },
    setSuggestedPrompts: (
      _,
      params: Parameters<ThreadStartedArgs["setSuggestedPrompts"]>[0]
    ) => {
      console.log("setting prompts", params);
    },
    setTitle: (_, params: Parameters<ThreadStartedArgs["setTitle"]>[0]) => {
      console.log("setting title", params);
    },
    saveContext: (_, params?: any) => {
      console.log("saving context", params);
    },
  },
}; 
