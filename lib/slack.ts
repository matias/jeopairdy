/**
 * Non-blocking Slack notification utility
 * Sends messages to Slack via webhook without blocking the main application flow
 */

interface SlackMessage {
  text: string;
  blocks?: Array<{
    type: string;
    text?: {
      type: string;
      text: string;
    };
    fields?: Array<{
      type: string;
      text: string;
    }>;
  }>;
}

/**
 * Send a message to Slack webhook (non-blocking)
 * Errors are logged but don't throw to avoid breaking the main flow
 * Uses an API route to access server-side environment variables
 */
export function sendSlackNotification(message: SlackMessage): void {
  // Fire and forget - don't block on the result
  fetch('/api/slack/notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  })
    .then((response) => {
      if (!response.ok) {
        console.error('Slack notification failed:', response.statusText);
      }
    })
    .catch((error) => {
      console.error('Error sending Slack notification:', error);
    });
}

/**
 * Send notification when a new game room is created
 */
export function notifyRoomCreated(data: {
  roomId: string;
  hostId: string;
  hostName?: string | null;
  hostEmail?: string | null;
}) {
  const hostDisplay = data.hostName || data.hostEmail || data.hostId;

  const fields = [
    {
      type: 'mrkdwn',
      text: `*Room ID:*\n\`${data.roomId}\``,
    },
    {
      type: 'mrkdwn',
      text: `*Host:*\n${hostDisplay}`,
    },
  ];

  // Add email if different from display name
  if (data.hostEmail && data.hostName) {
    fields.push({
      type: 'mrkdwn',
      text: `*Email:*\n${data.hostEmail}`,
    });
  }

  sendSlackNotification({
    text: `🎮 New game room created: ${data.roomId} by ${hostDisplay}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎮 New Jeopairdy Game Room Created',
        },
      },
      {
        type: 'section',
        fields,
      },
    ],
  });
}
