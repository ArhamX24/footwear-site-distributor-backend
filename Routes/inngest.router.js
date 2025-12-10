import { serve } from "inngest/express";
import { inngest } from "../Inngest/client.js";
import { inngestFunctions } from "../Inngest/functions/index.js";

const inngestRouter = serve({
  client: inngest,
  functions: inngestFunctions,
});

export default inngestRouter;
