// import { App, LogLevel } from "https://deno.land/x/slack_bolt@1.0.0/mod.ts";
import { env } from "node:process";
import pkg from '@slack/bolt'; 
const { App, LogLevel } = pkg; 

import assistant from './assistant.ts';

// import { SocketModeReceiver } from "@slack/bolt";
 


// const socketModeReceiver = new SocketModeReceiver({
//   appToken: env.SLACK_APP_TOKEN!
//   // enable the following if you want to use OAuth
//    // clientId: Deno.env.get("SLACK_CLIENT_ID"),
//   // clientSecret: Deno.env.get("SLACK_CLIENT_SECRET"),
//   // stateSecret: Deno.env.get("STATE_SECRET"),
//   // scopes: ["channels:read", "chat:write", "app_mentions:read", "channels:manage", "commands"],
//   //  scopes: [ "channels:read", "groups:read", "mpim:read", "im:read" ]


// });

const app = new App({
  token: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  socketMode: true,
  // receiver: socketModeReceiver,
  appToken: env.SLACK_APP_TOKEN,
  logLevel: LogLevel.DEBUG,
});

app.message(":wave:", async ({ message, say,context , ack}) => {
  console.log('message',message);
  // Handle only newly posted messages here
  await say({
    channel: message.channel,
    icon_emoji: ':wave:',
    text: `Hello, ${"user" in message ? `<@${message.user}>` : ''}`,
  });
});


app.event("app_mention", async ({ event, say }) => {
  console.log('app_mention',event);
  await say({
    channel: event.channel,
    text: `Hello ${"user" in event ? `<@${event.user}>` : ''}, How can I help you today?`,
  });
});


/** Sample Function Listener */
app.function("sample_step", async ({ client, inputs, fail, logger }) => {
  try {
    const { user_id } = inputs;

    await client.chat.postMessage({
      channel: user_id as string,
      text: "Click the button to signal the step has completed",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Click the button to signal the step has completed",
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Complete step",
            },
            action_id: "sample_button",
          },
        },
      ],
    });
  } catch (error) {
    logger.error(error);
    await fail({ error: `Failed to handle a step request: ${error}` });
  }
});
 

 
app.event('app_home_opened', async ({ event, client, logger }) => {
  console.log('app_home_opened',event);
  try {
    // Call views.publish with the built-in client
    const result = await client.views.publish({
      // Use the user ID associated with the event
      user_id: event.user,
      view: {
        // Home tabs must be enabled in your app configuration page under "App Home"
        type: "home",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Welcome home, <@" + event.user + "> :house:*"
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Learn how home tabs can be more useful and interactive <https://docs.slack.dev/surfaces/app-home|*in the documentation*>."
            }
          }
        ]
      }
    });

    logger.info(result);
  }
  catch (error) {
    logger.error(error);
  }
});

app.message('hello', async ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  await say({
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `Hey there <@${message.user}>!`
        },
        "accessory": {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Click Me"
          },
          "action_id": "button_click"
        }
      }
    ],
    text: `Hey there <@${message.user}>!`
  });
});

app.action('button_click', async ({ body, ack, say }) => {
  // Acknowledge the action
  await ack();
  await say(`<@${body.user.id}> clicked the button`);
});



(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  app.logger.info('⚡️ Bolt app is running!');
})();

app.assistant(assistant);


export default {
  fetch:async function handlePostRequest(req: Request): Promise<Response> {
    const channels = await app.client.hi.list();
    return new Response( JSON.stringify(channels));
  },
};
