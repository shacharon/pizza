import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { fromIni } from '@aws-sdk/credential-provider-ini';

const ADDRESS = 'shacharon@gmail.com';

const onEcs = Boolean(
  process.env.ECS_CONTAINER_METADATA_URI_V4 || process.env.ECS_CONTAINER_METADATA_URI,
);

const client = new SESv2Client({
  region: 'eu-north-1',
  ...(onEcs ? {} : { credentials: fromIni({ profile: 'pizza' }) }),
});

export async function sendFeedbackEmail(mood: 'like' | 'work', note: string): Promise<void> {
  const label = mood === 'like' ? 'I like it' : 'Needs work';
  const body = note ? note : '(no note)';
  await client.send(new SendEmailCommand({
    FromEmailAddress: ADDRESS,
    Destination: { ToAddresses: [ADDRESS] },
    Content: {
      Simple: {
        Subject: { Data: `Going2Eat feedback: ${label}`, Charset: 'UTF-8' },
        Body: {
          Text: {
            Data: `Mood: ${label}\n\n${body}\n`,
            Charset: 'UTF-8',
          },
        },
      },
    },
  }));
}
