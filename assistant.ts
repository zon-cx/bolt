import pkg from '@slack/bolt'; 
import { azure } from '@ai-sdk/azure';
import { generateText, CoreMessage } from 'ai';

const { Assistant } = pkg; 

const DEFAULT_SYSTEM_CONTENT = "You are a helpful assistant in Slack.";

  
  const assistant = new Assistant({
    /**
     * (Recommended) A custom ThreadContextStore can be provided, inclusive of methods to
     * get and save thread context. When provided, these methods will override the `getThreadContext`
     * and `saveThreadContext` utilities that are made available in other Assistant event listeners.
     */
    // threadContextStore: {
    //   get: async ({ context, client, payload }) => {},
    //   save: async ({ context, client, payload }) => {},
    // },
  
    /**
     * `assistant_thread_started` is sent when a user opens the Assistant container.
     * This can happen via DM with the app or as a side-container within a channel.
     * https://api.slack.com/events/assistant_thread_started
     */
    threadStarted: async ({ event, logger, say, setSuggestedPrompts, saveThreadContext }) => {
      const { context } = event.assistant_thread;
  
      try {
        // Since context is not sent along with individual user messages, it's necessary to keep
        // track of the context of the conversation to better assist the user. Sending an initial
        // message to the user with context metadata facilitates this, and allows us to update it
        // whenever the user changes context (via the `assistant_thread_context_changed` event).
        // The `say` utility sends this metadata along automatically behind the scenes.
        // !! Please note: this is only intended for development and demonstrative purposes.
        await say('Hi, how can I help?');
  
        await saveThreadContext();
  
        const prompts = [
          {
            title: 'This is a suggested prompt',
            message:
              'When a user clicks a prompt, the resulting prompt message text can be passed ' +
              'directly to your LLM for processing.\n\nAssistant, please create some helpful prompts ' +
              'I can provide to my users.',
          },
        ];
  
        // If the user opens the Assistant container in a channel, additional
        // context is available.This can be used to provide conditional prompts
        // that only make sense to appear in that context (like summarizing a channel).
        if (context.channel_id) {
          prompts.push({
            title: 'Summarize channel',
            message: 'Assistant, please summarize the activity in this channel!',
          });
        }
  
        /**
         * Provide the user up to 4 optional, preset prompts to choose from.
         * The optional `title` prop serves as a label above the prompts. If
         * not, provided, 'Try these prompts:' will be displayed.
         * https://api.slack.com/methods/assistant.threads.setSuggestedPrompts
         */
        if (prompts.length > 0) {
          await setSuggestedPrompts({ prompts: prompts as [typeof prompts[0], ...typeof prompts], title: 'Here are some suggested options:' });
        }
      } catch (e) {
        logger.error(e);
      }
    },
  
    /**
     * `assistant_thread_context_changed` is sent when a user switches channels
     * while the Assistant container is open. If `threadContextChanged` is not
     * provided, context will be saved using the AssistantContextStore's `save`
     * method (either the DefaultAssistantContextStore or custom, if provided).
     * https://api.slack.com/events/assistant_thread_context_changed
     */
    threadContextChanged: async ({ logger, saveThreadContext }) => {
      // const { channel_id, thread_ts, context: assistantContext } = event.assistant_thread;
      try {
        await saveThreadContext();
      } catch (e) {
        logger.error(e);
      }
    },
  
    /**
     * Messages sent to the Assistant do not contain a subtype and must
     * be deduced based on their shape and metadata (if provided).
     * https://api.slack.com/events/message
     */
    userMessage: async ({ client, logger, message, getThreadContext, say, setTitle, setStatus }) => {
      // Defensive: check for required properties
      const channel = (message as any).channel;
      const thread_ts = (message as any).thread_ts;
      const text = (message as any).text;
      if (!channel || !thread_ts || !text) {
        await say({ text: 'Sorry, I could not process your message (missing channel, thread, or text).' });
        return;
      }
      try {
        /**
         * Set the title of the Assistant thread to capture the initial topic/question
         * as a way to facilitate future reference by the user.
         * https://api.slack.com/methods/assistant.threads.setTitle
         */
        await setTitle(text);
  
        /**
         * Set the status of the Assistant to give the appearance of active processing.
         * https://api.slack.com/methods/assistant.threads.setStatus
         */
        await setStatus('is typing..');
  
        /** Scenario 1: Handle suggested prompt selection
         * The example below uses a prompt that relies on the context (channel) in which
         * the user has asked the question (in this case, to summarize that channel).
         */
        if (text === 'Assistant, please summarize the activity in this channel!') {
          const threadContext = await getThreadContext();
          const channel_id = threadContext.channel_id;
          if (!channel_id) {
            await say({ text: 'Sorry, I could not determine the channel to summarize.' });
            return;
          }
          let channelHistory;
  
          try {
            channelHistory = await client.conversations.history({
              channel: channel_id,
              limit: 50,
            });
          } catch (e) {
            // Type assertion for error object
            if (typeof e === 'object' && e && 'data' in e && (e as any).data.error === 'not_in_channel') {
              await client.conversations.join({ channel: channel_id });
              channelHistory = await client.conversations.history({
                channel: channel_id,
                limit: 50,
              });
            } else {
              logger.error(e);
              await say({ text: 'Sorry, I could not fetch channel history.' });
              return;
            }
          }
  
          if (!channelHistory || !channelHistory.messages) {
            await say({ text: 'Sorry, I could not fetch channel messages.' });
            return;
          }
  
          // Prepare and tag the prompt and messages for LLM processing
          let llmPrompt = `Please generate a brief summary of the following messages from Slack channel <#${channel_id}>:`;
          for (const m of channelHistory.messages.reverse()) {
            if (m.user && m.text) llmPrompt += `\n<@${m.user}> says: ${m.text}`;
          }
  
          const messages: CoreMessage[] = [
            { role: 'system', content: DEFAULT_SYSTEM_CONTENT },
            { role: 'user', content: llmPrompt },
          ];
  
          // Send channel history and prepared request to LLM
          const { text: aiText } = await generateText({
            model: azure('gpt-4o'), // or your Azure model name
            system: DEFAULT_SYSTEM_CONTENT,
            messages
          });
  
          // Provide a response to the user
          await say({ text: aiText });
  
          return;
        }
  
        /**
         * Scenario 2: Format and pass user messages directly to the LLM
         */
  
        // Retrieve the Assistant thread history for context of question being asked
        const thread = await client.conversations.replies({
          channel,
          ts: thread_ts,
          oldest: thread_ts,
        });
  
        if (!thread || !thread.messages) {
          await say({ text: 'Sorry, I could not fetch thread history.' });
          return;
        }
  
        // Prepare and tag each message for LLM processing
        const userMessage = { role: 'user', content: text };
        const threadHistory = thread.messages.map((m: any) => {
          const role = m.bot_id ? 'assistant' : 'user';
          return { role, content: m.text };
        });
  
        const messages: CoreMessage[] = [{ role: 'system', content: DEFAULT_SYSTEM_CONTENT }, ...threadHistory, userMessage];
  
        // Send message history and newest question to LLM
        const { text: aiText } = await generateText({
          model: azure('gpt-4o'), // or your Azure model name
          system: DEFAULT_SYSTEM_CONTENT,
          messages,
          maxSteps: 10,
        });
  
        // Provide a response to the user
        await say({ text: aiText });
      } catch (e) {
        logger.error(e);
  
        // Send message to advise user and clear processing status if a failure occurs
        await say({ text: 'Sorry, something went wrong!' });
      }
    },
  });
  
  

  export default assistant;