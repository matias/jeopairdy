/**
 * Non-blocking Slack notification utility
 * Sends messages to Slack via webhook without blocking the main application flow
 */

/**
 * Send a message to Slack webhook (non-blocking)
 * Errors are logged but don't throw to avoid breaking the main flow
 */
function sendSlackNotification(message) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn(
      'SLACK_WEBHOOK_URL not configured, skipping Slack notification',
    );
    return;
  }

  // Fire and forget - don't block on the result
  fetch(webhookUrl, {
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
function notifyRoomCreated(data) {
  const clientType = data.clientType || 'unknown';

  sendSlackNotification({
    text: `🎮 New game room created: ${data.roomId}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎮 New Game Room Created',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Room ID:*\n\`${data.roomId}\``,
          },
          {
            type: 'mrkdwn',
            text: `*Host ID:*\n\`${data.hostId}\``,
          },
          {
            type: 'mrkdwn',
            text: `*Client Type:*\n${clientType}`,
          },
        ],
      },
    ],
  });
}

module.exports = {
  sendSlackNotification,
  notifyRoomCreated,
};
