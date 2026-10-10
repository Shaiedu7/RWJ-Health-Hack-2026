import { App, Stack, CfnOutput, DefaultStackSynthesizer, RemovalPolicy } from "aws-cdk-lib";
import { CfnUserPool, CfnUserPoolClient, CfnUserPoolDomain, CfnManagedLoginBranding } from "aws-cdk-lib/aws-cognito";
import { CfnSecret } from "aws-cdk-lib/aws-secretsmanager";
import { ACCOUNT, REGION } from "../lib/patients-stack.js";
const app = new App({ analyticsReporting: false });
const stack = new Stack(app, "TwinVerseStudentAuth", {
  env: { account: ACCOUNT, region: REGION },
  description: "TwinVerse development student authentication and empty voice credential slot",
  terminationProtection: true,
  synthesizer: new DefaultStackSynthesizer({ generateBootstrapVersionRule: false }),
});
const pool = new CfnUserPool(stack, "StudentPool", {
  userPoolName: "twinverse-event-students", userPoolTier: "ESSENTIALS",
  deletionProtection: "ACTIVE", usernameAttributes: ["email"], autoVerifiedAttributes: ["email"],
  adminCreateUserConfig: { allowAdminCreateUserOnly: true },
  policies: { passwordPolicy: { minimumLength: 12, requireLowercase: true, requireUppercase: true, requireNumbers: true, requireSymbols: true } },
  accountRecoverySetting: { recoveryMechanisms: [{ name: "verified_email", priority: 1 }] },
});
pool.applyRemovalPolicy(RemovalPolicy.RETAIN);
const client = new CfnUserPoolClient(stack, "StudentClient", {
  userPoolId: pool.ref, clientName: "twinverse-student-browser", generateSecret: false,
  allowedOAuthFlowsUserPoolClient: true, allowedOAuthFlows: ["code"],
  allowedOAuthScopes: ["openid", "email"], supportedIdentityProviders: ["COGNITO"],
  callbackUrLs: ["http://localhost:8443/auth/callback", "http://127.0.0.1:8443/auth/callback"],
  logoutUrLs: ["http://localhost:8443/", "http://127.0.0.1:8443/"],
  enableTokenRevocation: true, preventUserExistenceErrors: "ENABLED",
  accessTokenValidity: 15, idTokenValidity: 15, refreshTokenValidity: 1,
  tokenValidityUnits: { accessToken: "minutes", idToken: "minutes", refreshToken: "days" },
  refreshTokenRotation: { feature: "ENABLED", retryGracePeriodSeconds: 10 },
});
const domain = new CfnUserPoolDomain(stack, "StudentDomain", {
  userPoolId: pool.ref, domain: "twinverse-students-977659666193", managedLoginVersion: 2,
});
const branding = new CfnManagedLoginBranding(stack, "StudentLoginStyle", {
  userPoolId: pool.ref, clientId: client.ref, useCognitoProvidedValues: true,
});
branding.addDependency(domain);
const secret = new CfnSecret(stack, "ElevenLabsConfiguration", {
  name: "twinverse/event/elevenlabs", description: "Enter ElevenLabs apiKey here manually; never expose it in browser configuration",
  secretString: '{"apiKey":""}',
});
secret.applyRemovalPolicy(RemovalPolicy.RETAIN);
new CfnOutput(stack, "UserPoolId", { value: pool.ref });
new CfnOutput(stack, "ClientId", { value: client.ref });
new CfnOutput(stack, "LoginDomain", { value: `https://${domain.domain}.auth.${REGION}.amazoncognito.com` });
new CfnOutput(stack, "ElevenLabsSecretArn", { value: secret.ref });
app.synth();
