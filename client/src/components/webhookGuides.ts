/**
 * @file webhookGuides.ts
 * @description Per-provider "how to get your webhook / credentials" setup steps
 * and an official-docs link, surfaced in the webhook form. This is reference
 * copy that can drift as providers change their UIs — the form shows a note
 * telling users to confirm against the official docs.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import type { WebhookType } from "../lib/types";

export interface WebhookGuide {
  docsUrl?: string;
  steps: string[];
}

export const WEBHOOK_GUIDES: Record<WebhookType, WebhookGuide> = {
  slack: {
    docsUrl: "https://api.slack.com/messaging/webhooks",
    steps: [
      "Create or open a Slack app at api.slack.com/apps.",
      "Turn on 'Incoming Webhooks', then click 'Add New Webhook to Workspace'.",
      "Choose the channel to post to and authorize.",
      "Copy the generated URL (https://hooks.slack.com/services/…) and paste it above.",
    ],
  },
  discord: {
    docsUrl: "https://support.discord.com/hc/en-us/articles/228383668",
    steps: [
      "Open your server → Server Settings → Integrations → Webhooks.",
      "Click 'New Webhook', pick a channel, optionally rename it.",
      "Click 'Copy Webhook URL' and paste it above.",
    ],
  },
  teams: {
    docsUrl: "https://learn.microsoft.com/en-us/microsoftteams/platform/workflow",
    steps: [
      "In the target Teams channel, click ⋯ → 'Workflows'.",
      "Pick the template 'Post to a channel when a webhook request is received'.",
      "Finish the flow and copy the generated HTTP POST URL.",
      "Paste it above. (Classic Office 365 connectors were retired in 2025 — use Workflows.)",
    ],
  },
  google_chat: {
    docsUrl: "https://developers.google.com/workspace/chat/quickstart/webhooks",
    steps: [
      "Open the Google Chat space → space title → 'Apps & integrations'.",
      "Click 'Webhooks' → 'Add webhook' and give it a name.",
      "Copy the webhook URL and paste it above.",
    ],
  },
  mattermost: {
    docsUrl: "https://developers.mattermost.com/integrate/webhooks/incoming/",
    steps: [
      "Main Menu → Integrations → Incoming Webhooks (an admin must enable webhooks first).",
      "Click 'Add Incoming Webhook' and choose a channel.",
      "Save, then copy the webhook URL and paste it above.",
    ],
  },
  rocketchat: {
    docsUrl: "https://docs.rocket.chat/docs/integrations",
    steps: [
      "Administration → Integrations → New → Incoming.",
      "Enable it, pick a channel, and save.",
      "Copy the 'Webhook URL' and paste it above.",
    ],
  },
  telegram: {
    docsUrl: "https://core.telegram.org/bots#how-do-i-create-a-bot",
    steps: [
      "Message @BotFather, run /newbot, and copy the bot token.",
      "Add the bot to your group/channel (or just DM it).",
      "Find the chat ID: send a message, open https://api.telegram.org/bot<token>/getUpdates, read result[].message.chat.id.",
      "Enter the Bot token and Chat ID above — no URL needed.",
    ],
  },
  pagerduty: {
    docsUrl: "https://support.pagerduty.com/docs/services-and-integrations",
    steps: [
      "Open the target Service → Integrations → 'Add integration'.",
      "Choose 'Events API v2'.",
      "Copy the Integration Key (the routing key).",
      "Enter it as the Routing key above — the Events API URL is prefilled.",
    ],
  },
  opsgenie: {
    docsUrl: "https://support.atlassian.com/opsgenie/docs/create-a-default-api-integration/",
    steps: [
      "Settings → Integrations → add an 'API' integration.",
      "Copy the generated API key.",
      "Note your account region (US or EU).",
      "Enter the API key and region above — the alerts URL is derived from the region.",
    ],
  },
  splunk_oncall: {
    docsUrl: "https://help.victorops.com/knowledge-base/rest-endpoint-integration-guide/",
    steps: [
      "Integrations → REST Endpoint, and enable it.",
      "Copy the REST URL — it already contains your API key.",
      "Replace the trailing '$routing_key' with one of your routing keys.",
      "Paste the full URL above.",
    ],
  },
  zapier: {
    docsUrl: "https://zapier.com/apps/webhook/integrations",
    steps: [
      "Create a Zap with the trigger 'Webhooks by Zapier' → 'Catch Hook'.",
      "Copy the custom webhook URL it gives you.",
      "Paste it above. The alert arrives as JSON: { event, alert }.",
    ],
  },
  make: {
    docsUrl: "https://www.make.com/en/help/tools/webhooks",
    steps: [
      "Add a 'Webhooks' → 'Custom webhook' module as the first step of a scenario.",
      "Click 'Add', create the hook, and copy its URL.",
      "Paste it above, then run once so Make learns the payload shape.",
    ],
  },
  n8n: {
    docsUrl: "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/",
    steps: [
      "Add a 'Webhook' node to your workflow; set the method to POST.",
      "Copy the Production URL.",
      "Activate the workflow and paste the URL above (http is allowed for self-hosted).",
    ],
  },
  pipedream: {
    docsUrl: "https://pipedream.com/docs/workflows/triggers/",
    steps: [
      "Create a workflow with an 'HTTP / Webhook' trigger.",
      "Copy the unique endpoint URL.",
      "Paste it above; inspect deliveries in the Pipedream event inspector.",
    ],
  },
  generic: {
    steps: [
      "Point this at any endpoint that accepts a JSON POST (https, or http for local testing).",
      "Body shape: { event: 'alert.triggered', source, sent_at, alert: { … } }.",
      "Optional: set a signing secret (HMAC-SHA256 over the body → X-Webhook-Signature header) and custom headers.",
      "Tip: use a free inspector like webhook.site to see the exact payload.",
    ],
  },
};
