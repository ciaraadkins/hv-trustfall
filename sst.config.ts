/// <reference path="./.sst/platform/config.d.ts" />
// How Trustfall runs in AWS, at humanversus.tech/trustfall. `npm run deploy`
// creates/updates everything below. It shares the Human Versus AWS account with
// Haystack (repo find-ai-picture): the RDS instance and the humanversus.tech
// Router are Haystack's, and are only referenced here, never changed.
export default $config({
  app(input) {
    return {
      name: "trustfall",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: input?.stage === "production",
      home: "aws",
      providers: { aws: { region: "us-east-2", profile: "lcf" } },
    };
  },
  async run() {
    // The Router that owns humanversus.tech, created by Haystack's production stage
    // (its `routerId` output). Every Human Versus tool attaches to it at its own path.
    const HUMAN_VERSUS_ROUTER_ID = "E2H0IIBV2Y3FXI";
    const isProduction = $app.stage === "production";

    // ── Secrets (set with `npx sst secret set <Name> <value> --stage <stage>`, never in git) ──
    const secrets = {
      DbPassword: new sst.Secret("DbPassword"),
      RoundTokenSecret: new sst.Secret("RoundTokenSecret"),
      AnthropicApiKey: new sst.Secret("AnthropicApiKey"),
      OpenaiApiKey: new sst.Secret("OpenaiApiKey"),
      GeminiApiKey: new sst.Secret("GeminiApiKey"),
      XaiApiKey: new sst.Secret("XaiApiKey"),
      DeepseekApiKey: new sst.Secret("DeepseekApiKey"),
    };

    // ── Database: its own database and user on Haystack's RDS instance ──
    // Production uses `trustfall`; other stages `trustfall_<stage>`. Both are created
    // once by hand (see README), since the instance belongs to Haystack's app.
    const postgres = aws.rds.Instance.get("Postgres", "lcf-production");
    const database = new sst.Linkable("Database", {
      properties: {
        host: postgres.address,
        port: postgres.port,
        username: "trustfall_app",
        password: secrets.DbPassword.value,
        database: isProduction ? "trustfall" : `trustfall_${$app.stage.replace(/\W/g, "_")}`,
      },
    });

    // ── The website: Next.js on Lambda behind CloudFront, at /trustfall ──
    // Production attaches to the shared Router; other stages get their own
    // CloudFront address (still under /trustfall, the app's basePath).
    const site = new sst.aws.Nextjs("Site", {
      router:
        isProduction && HUMAN_VERSUS_ROUTER_ID
          ? { instance: sst.aws.Router.get("HumanVersusRouter", HUMAN_VERSUS_ROUTER_ID), path: "/trustfall" }
          : undefined,
      link: [database],
      environment: {
        RUNTIME: "aws",
        ROUND_TOKEN_SECRET: secrets.RoundTokenSecret.value,
        ANTHROPIC_API_KEY: secrets.AnthropicApiKey.value,
        OPENAI_API_KEY: secrets.OpenaiApiKey.value,
        GEMINI_API_KEY: secrets.GeminiApiKey.value,
        XAI_API_KEY: secrets.XaiApiKey.value,
        DEEPSEEK_API_KEY: secrets.DeepseekApiKey.value,
      },
      // A turn is one model call (two with a retry), a few seconds each.
      server: { memory: "1024 MB", timeout: "30 seconds" },
    });

    return { url: site.url };
  },
});
