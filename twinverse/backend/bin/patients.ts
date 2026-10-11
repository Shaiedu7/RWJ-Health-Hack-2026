import { App, Validations, DefaultStackSynthesizer, Tags } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import {
  ACCOUNT,
  PatientsStack,
  REGION,
  STACK_NAME,
} from "../lib/patients-stack.js";

const app = new App({ analyticsReporting: false });
new PatientsStack(app, STACK_NAME, {
  env: { account: ACCOUNT, region: REGION },
  stackName: STACK_NAME,
  description:
    "TwinVerse step 1: only the Patients table and its owner/published indexes.",
  terminationProtection: true,
  // No assets: deploy the synthesized TemplateBody through CloudFormation under
  // the existing event role. This step does not run CDK CLI deployment/bootstrap.
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
Tags.of(app).add("Project", "TwinVerse");
Tags.of(app).add("Scope", "twinverse-event");
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
