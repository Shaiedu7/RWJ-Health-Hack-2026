# AWS access on another computer (no AWS CLI required)

The backend uses the AWS SDK and the named profile `twinverse-event`. These example files do not contain credentials and do not connect you until you fill in your own temporary event credentials.

1. Obtain the access key ID, secret access key, and session token for the shared event account from your event access provider. A console login alone does not supply these values. If your event portal does not offer temporary programmatic credentials, ask the organizers how to obtain them.
2. Open your home folder and create a `.aws` folder if it does not exist. On macOS/Linux the destination is `~/.aws/`; on Windows it is `%USERPROFILE%\.aws\`.
3. Copy `credentials.example` there and rename it **credentials**, with no extension. Replace the three placeholders in your local copy. If the file already exists, add or update only its `[twinverse-event]` section; preserve other profiles. Do not replace credentials from an existing working login workflow.
4. Copy `config.example` there and rename it **config**, with no extension. If it already exists, add or update only `[profile twinverse-event]`.
5. Restart the local backend using the existing project run instructions. The backend reads this profile automatically; the frontend never needs these credentials.

Use credentials for account `977659666193` with access to the existing TwinVerse services in `us-west-2`. All three values must come from the same temporary session. When it expires, replace all three. On macOS/Linux restrict your local credentials file to your user (`chmod 600 ~/.aws/credentials`).

Do not fill in the repository's example files. Real credentials belong only in your computer's private `.aws` folder, never in React, GitHub, or chat. ElevenLabs uses a separate server-side secret; these AWS files do not replace it. This setup creates no AWS resources and grants no new permissions.

AWS reference: https://docs.aws.amazon.com/sdkref/latest/guide/file-format.html
