# Stage 1 deployment review

Prepared only, not deployed. The existing Patients stack/table remains unchanged.

New stack: TwinVerseStudentAuth, account 977659666193, region us-west-2.

Resources: one Cognito student user pool (Essentials plan, retained, deletion protected, email login, admin-created users only); one public OAuth code-flow app client (no secret, short-lived tokens, rotation/revocation); one Cognito prefix domain; one default managed-login branding resource; one retained Secrets Manager secret named twinverse/event/elevenlabs with an empty apiKey field.

No new IAM roles, policies, grants, S3 buckets, or CDK bootstrap resources are defined. Deployment uses the existing event role via a synthesized CloudFormation template. Requires CloudFormation stack creation, Cognito creation/branding operations, Secrets Manager CreateSecret/TagResource, and read/describe permissions for verification. This is not a claim that the event role has those permissions. Cognito Essentials and Secrets Manager may incur charges; event eligibility remains to be checked.

After approval and successful deployment, create the demo student accounts through Cognito with verified email onboarding. Admin-only account creation restricts demo access. Do not disable account verification or publish self-registration just to get around event restrictions. No users are created by this template.

## Where to put the ElevenLabs key

After deployment, open AWS Console > Secrets Manager in Oregon > twinverse/event/elevenlabs > retrieve/edit secret value. Enter the key in the apiKey field yourself and save. Do not paste the key into chat, frontend files, or VITE variables. The initial value is empty, so speech will be unavailable until it is configured. Updating the secret later must not be followed by a stack update that resets its value to empty; remove/manage the initializer before future secret resource updates.

.env.server.example provides only the runtime reference and voice ID slot. The future backend will use asm-exec to resolve the secret without the coding agent reading its value. No key is required for Stage 1 and no secret values have been fetched.

## Remaining work after deployment

Wire managed-login authorization-code + PKCE, verify Cognito access tokens on every protected route, restrict preview to demo users, and enforce encounter ownership from verified subject claims. Then connect patient cards/room, persistent encounters, Bedrock, and finally voice. Nothing in this prepared template proves login or ownership isolation works yet. The existing read-only loopback preview remains an isolated development tool, not the future authenticated endpoint.
