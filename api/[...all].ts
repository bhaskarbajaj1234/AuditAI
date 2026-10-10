export default async function handler(req: any, res: any) {
    // Dynamic import as suggested by Vercel logs to bypass ESM/CJS conflict
    const { default: app } = await import("../BackEnd/src/app");
    return app(req, res);
}