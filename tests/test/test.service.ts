import { createService } from "@csi-foxbyte/fastify-toab";

const testService = createService("test", async () => {
    // Your code here...
    throw new Error("ASDHSADK")
}, {
    buildTime: "INSTANT",
});

export default testService;
